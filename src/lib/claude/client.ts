import Anthropic, { APIError } from '@anthropic-ai/sdk';

export const CLAUDE_SONNET = 'claude-sonnet-4-6-20250929' as const;
export const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001' as const;

type ClaudeModel = typeof CLAUDE_SONNET | typeof CLAUDE_HAIKU;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ClaudeConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeCallOptions {
  model: ClaudeModel;
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: ClaudeConversationMessage[];
  maxTokens?: number;
  useWebSearch?: boolean;
  webSearchMaxUses?: number;
  temperature?: number;
  thinkingBudget?: number;
}

export interface ClaudeSource {
  url: string;
  title: string;
  domain: string;
  citedText?: string;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  webSearchRequests: number;
}

export interface ClaudeResponse {
  text: string;
  sources: ClaudeSource[];
  model: ClaudeModel;
  usage: ClaudeUsage;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function buildMessages(
  conversationHistory: ClaudeConversationMessage[],
  userMessage: string
): Anthropic.MessageParam[] {
  return [
    ...conversationHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: 'user', content: userMessage },
  ];
}

function buildUsage(usage: Anthropic.Messages.Usage | undefined): ClaudeUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    webSearchRequests: usage?.server_tool_use?.web_search_requests ?? 0,
  };
}

function extractResponse(message: Anthropic.Message): { text: string; sources: ClaudeSource[] } {
  const textParts: string[] = [];
  const sources = new Map<string, ClaudeSource>();

  for (const block of message.content) {
    if (block.type !== 'text') continue;

    textParts.push(block.text);

    for (const citation of block.citations ?? []) {
      if (citation.type !== 'web_search_result_location' || !citation.url) continue;
      if (!sources.has(citation.url)) {
        sources.set(citation.url, {
          url: citation.url,
          title: citation.title || domainOf(citation.url),
          domain: domainOf(citation.url),
          citedText: citation.cited_text || undefined,
        });
      }
    }
  }

  return {
    text: textParts.join(''),
    sources: Array.from(sources.values()),
  };
}

function buildRequest(options: ClaudeCallOptions): Anthropic.MessageCreateParamsNonStreaming {
  const {
    model,
    systemPrompt,
    userMessage,
    conversationHistory = [],
    maxTokens = 16384,
    useWebSearch = false,
    webSearchMaxUses = 5,
    temperature = 1,
    thinkingBudget = 0,
  } = options;

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: buildMessages(conversationHistory, userMessage),
    temperature,
  };

  if (useWebSearch) {
    request.tools = [
      {
        type: 'web_search_20260209',
        name: 'web_search',
        max_uses: webSearchMaxUses,
      },
    ];
  }

  if (thinkingBudget > 0) {
    request.thinking = {
      type: 'enabled',
      budget_tokens: Math.max(1024, thinkingBudget),
    };
    request.temperature = 1;
  }

  return request;
}

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeResponse> {
  const client = getClient();
  const startedAt = Date.now();
  const request = buildRequest(options);
  const response = await client.messages.create(request);
  const elapsedMs = Date.now() - startedAt;
  const extracted = extractResponse(response);
  const usage = buildUsage(response.usage);

  if (process.env.NODE_ENV === 'development') {
    console.log(`[CLAUDE] ${options.model} completed in ${elapsedMs}ms`);
    console.log(`[CLAUDE] Tokens: ${usage.inputTokens} in / ${usage.outputTokens} out`);
    console.log(`[CLAUDE] Web searches: ${usage.webSearchRequests}`);
    console.log(`[CLAUDE] Sources: ${extracted.sources.length}`);
  }

  return {
    text: extracted.text,
    sources: extracted.sources,
    model: options.model,
    usage,
  };
}

export async function callClaudeStream(
  options: Omit<ClaudeCallOptions, 'useWebSearch' | 'webSearchMaxUses' | 'thinkingBudget'>,
  onChunk: (text: string) => void
): Promise<ClaudeResponse> {
  const client = getClient();
  const {
    model,
    systemPrompt,
    userMessage,
    conversationHistory = [],
    maxTokens = 16384,
    temperature = 1,
  } = options;

  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: buildMessages(conversationHistory, userMessage),
    temperature,
  });

  const chunks: string[] = [];

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      chunks.push(event.delta.text);
      onChunk(event.delta.text);
    }
  }

  const finalMessage = await stream.finalMessage();
  const extracted = extractResponse(finalMessage);

  return {
    text: chunks.join('') || extracted.text,
    sources: extracted.sources,
    model,
    usage: buildUsage(finalMessage.usage),
  };
}

export function sanitizeClaudeError(status: number | undefined, message: string): string {
  const normalized = message.toLowerCase();

  if (!status && normalized.includes('anthropic_api_key')) {
    return 'The Anthropic API key is not configured.';
  }
  if (
    status === 408 ||
    status === 504 ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'The AI service is taking too long to respond. Please try again.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (
    status === 529 ||
    status === 503 ||
    normalized.includes('overloaded') ||
    normalized.includes('temporarily unavailable')
  ) {
    return 'The AI service is temporarily overloaded. Please try again in a moment.';
  }
  if (status === 400) {
    return 'I had trouble understanding that request. Try rephrasing.';
  }
  if (status && status >= 500) {
    return 'The AI service encountered a temporary error. Please try again.';
  }
  if (message.trim().length > 0) {
    return message;
  }
  return 'Something unexpected happened. Please try again.';
}

export function parseClaudeJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim(),
    trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/m)?.[1]?.trim(),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Keep trying looser candidates.
    }
  }

  return null;
}

export function isClaudeApiError(error: unknown): error is APIError {
  return error instanceof APIError;
}
