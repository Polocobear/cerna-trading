const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_TIMEOUT_MS = 30000;

export type AnthropicModel = 'claude-sonnet-4-6';

export interface AnthropicMessageOptions {
  model: AnthropicModel;
  systemPrompt: string;
  userMessage: string;
  enableWebSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
  requestTimeoutMs?: number;
  retryOptions?: {
    maxRetries?: number;
    backoffMs?: number;
    deadlineMs?: number;
  };
}

export interface AnthropicNonStreamResult {
  text: string;
  sources: Array<{ title: string; url: string; domain: string; snippet?: string }>;
  raw: unknown;
}

type AnthropicError = Error & {
  status?: number;
  rawText?: string;
  model?: string;
};

interface AnthropicCitation {
  type?: string;
  url?: string;
  title?: string;
  cited_text?: string;
}

interface AnthropicTextBlock {
  type: 'text';
  text?: string;
  citations?: AnthropicCitation[];
}

interface AnthropicWebSearchResult {
  type: 'web_search_result';
  url?: string;
  title?: string;
}

interface AnthropicWebSearchToolResult {
  type: 'web_search_tool_result';
  content?: AnthropicWebSearchResult[] | { type?: string; error_code?: string };
}

interface AnthropicResponseJson {
  content?: Array<AnthropicTextBlock | AnthropicWebSearchToolResult | { type?: string }>;
}

function isTextBlock(
  block: AnthropicTextBlock | AnthropicWebSearchToolResult | { type?: string }
): block is AnthropicTextBlock {
  return block.type === 'text';
}

function isWebSearchToolResult(
  block: AnthropicTextBlock | AnthropicWebSearchToolResult | { type?: string }
): block is AnthropicWebSearchToolResult {
  return block.type === 'web_search_tool_result';
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status === 503 || status >= 500;
}

function buildAnthropicError(model: string, status: number, rawText: string): AnthropicError {
  const err = new Error(sanitizeAnthropicError(status, rawText)) as AnthropicError;
  err.status = status;
  err.rawText = rawText;
  err.model = model;
  return err;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  model: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw buildAnthropicError(model, 504, `Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callWithRetry(
  fn: () => Promise<Response>,
  options?: {
    maxRetries?: number;
    backoffMs?: number;
    deadlineMs?: number;
  }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 1;
  const backoffMs = options?.backoffMs ?? 1000;
  const deadlineMs = options?.deadlineMs;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (deadlineMs && Date.now() > deadlineMs - 3000) {
      return fn();
    }

    try {
      const res = await fn();
      if (res.ok || !isRetryableStatus(res.status) || attempt === maxRetries) {
        return res;
      }
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) throw err;
    }

    const jitter = Math.random() * 300;
    await wait(backoffMs * (attempt + 1) + jitter);
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error('The AI service encountered a temporary error. Please try again.')
  );
}

export function sanitizeAnthropicError(status: number, rawText: string): string {
  const normalized = rawText.toLowerCase();

  if (
    status === 408 ||
    status === 504 ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'The AI service is taking too long to respond. Please try again.';
  }
  if (
    status === 503 ||
    normalized.includes('overloaded') ||
    normalized.includes('high demand') ||
    normalized.includes('unavailable')
  ) {
    return 'The AI service is temporarily overloaded. Please try again in a moment.';
  }
  if (status === 429 || normalized.includes('rate limit')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (status === 401 || status === 403) {
    return 'The AI service credentials are invalid or missing.';
  }
  if (status === 400) {
    return 'I had trouble understanding that request. Try rephrasing.';
  }
  if (status >= 500) {
    return 'The AI service encountered a temporary error. Please try again.';
  }
  return 'Something unexpected happened. Please try again.';
}

export async function callAnthropicMessage(
  opts: AnthropicMessageOptions
): Promise<AnthropicNonStreamResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const url = `${ANTHROPIC_API_BASE}/messages`;
  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userMessage }],
    temperature: opts.temperature ?? 0.4,
  };

  if (opts.enableWebSearch) {
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      },
    ];
  }

  let res: Response;
  try {
    res = await callWithRetry(
      () =>
        fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
          },
          opts.requestTimeoutMs ?? DEFAULT_ANTHROPIC_TIMEOUT_MS,
          opts.model
        ),
      opts.retryOptions
    );
  } catch (err) {
    if ((err as AnthropicError).status) {
      throw err;
    }
    throw buildAnthropicError(
      opts.model,
      504,
      err instanceof Error ? err.message : 'Anthropic request failed'
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Anthropic] Non-OK response', {
      model: opts.model,
      status: res.status,
      body: text,
    });
    throw buildAnthropicError(opts.model, res.status, text);
  }

  const json = (await res.json()) as AnthropicResponseJson;
  const blocks = json.content ?? [];
  let text = '';
  const sources = new Map<string, { title: string; url: string; domain: string; snippet?: string }>();

  for (const block of blocks) {
    if (isTextBlock(block)) {
      if (typeof block.text === 'string') {
        text += block.text;
      }
      for (const citation of block.citations ?? []) {
        if (!citation.url) continue;
        if (!sources.has(citation.url)) {
          sources.set(citation.url, {
            title: citation.title ?? '',
            url: citation.url,
            domain: domainOf(citation.url),
            snippet: citation.cited_text,
          });
        }
      }
      continue;
    }

    if (isWebSearchToolResult(block) && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (!result.url) continue;
        if (!sources.has(result.url)) {
          sources.set(result.url, {
            title: result.title ?? '',
            url: result.url,
            domain: domainOf(result.url),
          });
        }
      }
    }
  }

  return {
    text: text.trim(),
    sources: Array.from(sources.values()),
    raw: json,
  };
}
