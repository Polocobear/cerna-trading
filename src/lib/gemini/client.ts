const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_GEMINI_STREAM_CONNECT_TIMEOUT_MS = 10000;
const DEADLINE_BUFFER_MS = 2000;
const MIN_DEADLINE_REMAINING_MS = 3000;

export const GEMINI_FLASH_MODEL = 'gemini-3-flash-preview' as const;
export const GEMINI_RESEARCH_MODEL = 'gemini-3.1-pro-preview' as const;
// Keep the historical export name for the Vercel-side default model.
export const GEMINI_MODEL = GEMINI_FLASH_MODEL;

let didLogGroundedResponseShape = false;

// Tiered model routing for the legacy /api/chat path. Both tiers map to the
// same model so old callers still work without reintroducing slow models.
const MODELS = {
  standard: GEMINI_FLASH_MODEL,
  deep: GEMINI_FLASH_MODEL,
} as const;

export type ModelTier = keyof typeof MODELS;

export interface GeminiRequest {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tier?: ModelTier;
}

export interface GeminiGroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface GeminiGroundingSupport {
  segment?: {
    text?: string;
  };
  groundingChunkIndices?: number[];
}

export interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
  webSearchQueries?: string[];
  searchEntryPoint?: {
    renderedContent?: string;
  };
}

/**
 * Legacy callGemini used by /api/chat.
 * Kept intact for backward compatibility.
 */
export async function callGemini(request: GeminiRequest): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const tier = request.tier ?? 'standard';
  const model = MODELS[tier];

  const contents = request.messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const body = {
    systemInstruction: {
      parts: [{ text: request.systemPrompt }],
    },
    contents,
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 1.0,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
      maxOutputTokens: tier === 'deep' ? 8192 : 4096,
    },
  };

  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  return callWithRetry(
    (timeoutMs) =>
      fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
        model
      ),
    {
      model,
      requestTimeoutMs: DEFAULT_GEMINI_STREAM_CONNECT_TIMEOUT_MS,
    }
  );
}

// =============================================================================
// v2 API used by the Phase 7B agent backend.
// =============================================================================

export type GeminiV2Model = typeof GEMINI_FLASH_MODEL | typeof GEMINI_RESEARCH_MODEL;
export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface GeminiSchema {
  type: 'OBJECT' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY';
  description?: string;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiSchema;
}

export interface GeminiV2Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface GeminiV2Options {
  model: GeminiV2Model;
  systemPrompt: string;
  userMessage?: string;
  messages?: GeminiV2Message[];
  tools?: GeminiFunctionDeclaration[];
  enableSearchGrounding?: boolean;
  stream?: boolean;
  responseSchema?: GeminiSchema;
  responseMimeType?: 'application/json' | 'text/plain';
  temperature?: number;
  thinking_level?: GeminiThinkingLevel;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
  retryOptions?: {
    maxRetries?: number;
    backoffMs?: number;
    deadlineMs?: number;
  };
}

export interface GeminiV2FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiV2NonStreamResult {
  text: string;
  functionCalls: GeminiV2FunctionCall[];
  sources: Array<{ title: string; url: string; domain: string; snippet?: string }>;
  raw: unknown;
}

interface GeminiCandidatePart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
}

interface GeminiCandidate {
  content?: { parts?: GeminiCandidatePart[] };
  groundingMetadata?: GeminiGroundingMetadata;
}

interface GeminiResponseJson {
  candidates?: GeminiCandidate[];
  groundingMetadata?: GeminiGroundingMetadata;
}

interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  deadlineMs?: number;
  requestTimeoutMs?: number;
  model: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiError = Error & {
  status?: number;
  rawText?: string;
  model?: string;
};

function buildGeminiError(model: string, status: number, rawText: string): GeminiError {
  const err = new Error(sanitizeGeminiError(status, rawText)) as GeminiError;
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
      throw buildGeminiError(model, 504, `Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveRequestTimeoutMs(
  model: string,
  requestTimeoutMs: number,
  deadlineMs?: number
): number {
  if (!deadlineMs) return requestTimeoutMs;

  const remaining = deadlineMs - Date.now();
  if (remaining <= MIN_DEADLINE_REMAINING_MS) {
    throw buildGeminiError(model, 504, 'Deadline exceeded - insufficient time for Gemini call');
  }

  return Math.min(requestTimeoutMs, Math.max(1000, remaining - DEADLINE_BUFFER_MS));
}

export async function callWithRetry(
  fn: (timeoutMs: number) => Promise<Response>,
  options?: RetryOptions
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2;
  const backoffMs = options?.backoffMs ?? 2000;
  const deadline = options?.deadlineMs;
  const requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  const model = options?.model ?? GEMINI_MODEL;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const timeoutMs = resolveRequestTimeoutMs(model, requestTimeoutMs, deadline);

    try {
      const res = await fn(timeoutMs);

      if (res.ok) return res;

      if (!isRetryableStatus(res.status) || attempt === maxRetries) {
        return res;
      }

      const jitter = Math.random() * 500;
      await wait(backoffMs * (attempt + 1) + jitter);
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) {
        throw err;
      }
      const jitter = Math.random() * 500;
      await wait(backoffMs * (attempt + 1) + jitter);
    }
  }

  throw (
    lastError instanceof Error
      ? lastError
      : new Error('The AI service encountered a temporary error. Please try again.')
  );
}

export function sanitizeGeminiError(status: number, rawText: string): string {
  const normalized = rawText.toLowerCase();

  if (
    normalized.includes('deadline exceeded') ||
    normalized.includes('insufficient time for gemini call')
  ) {
    return 'The request ran out of time before the AI call could finish. Please try again.';
  }
  if (
    status === 408 ||
    status === 504 ||
    normalized.includes('timed out') ||
    normalized.includes('timeout')
  ) {
    return 'The AI service is taking too long to respond. Please try again.';
  }
  if (status === 503 || normalized.includes('high demand')) {
    return 'The AI service is temporarily overloaded. Please try again in a moment.';
  }
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 400) return 'I had trouble understanding that request. Try rephrasing.';
  if (status >= 500) return 'The AI service encountered a temporary error. Please try again.';
  return 'Something unexpected happened. Please try again.';
}

function buildV2Body(opts: GeminiV2Options): Record<string, unknown> {
  const messages: GeminiV2Message[] =
    opts.messages ??
    (opts.userMessage !== undefined ? [{ role: 'user', content: opts.userMessage }] : []);

  const contents = messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  // Gemini disallows mixing google_search with functionDeclarations in the same
  // request. Caller must choose one. Orchestrator uses tools; agents use search.
  const tools: Array<Record<string, unknown>> = [];
  if (opts.tools && opts.tools.length > 0) {
    tools.push({ functionDeclarations: opts.tools });
  } else if (opts.enableSearchGrounding) {
    tools.push({ google_search: {} });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 1.0,
    maxOutputTokens: opts.maxOutputTokens,
  };
  if (opts.thinking_level) {
    generationConfig.thinkingConfig = { thinkingLevel: opts.thinking_level };
  }
  if (opts.responseMimeType) {
    generationConfig.responseMimeType = opts.responseMimeType;
  }
  if (opts.responseSchema) {
    generationConfig.responseSchema = opts.responseSchema;
  }

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents,
    generationConfig,
  };
  if (tools.length > 0) body.tools = tools;
  return body;
}

function maybeLogGroundedResponseShape(
  response: GeminiResponseJson,
  enableSearchGrounding: boolean
): void {
  if (!enableSearchGrounding || process.env.NODE_ENV !== 'development' || didLogGroundedResponseShape) {
    return;
  }

  didLogGroundedResponseShape = true;
  const candidate = response.candidates?.[0];

  console.log('[GEMINI] Full grounded response keys:', JSON.stringify(Object.keys(response)));
  if (candidate) {
    console.log('[GEMINI] Candidate keys:', JSON.stringify(Object.keys(candidate)));
    if (candidate.groundingMetadata) {
      console.log(
        '[GEMINI] Candidate grounding keys:',
        JSON.stringify(Object.keys(candidate.groundingMetadata))
      );
    }
  }
  if (response.groundingMetadata) {
    console.log(
      '[GEMINI] Top-level grounding keys:',
      JSON.stringify(Object.keys(response.groundingMetadata))
    );
  }
}

function extractSourcesFromGroundingMetadata(
  groundingMetadata?: GeminiGroundingMetadata
): Array<{ title: string; url: string; domain: string; snippet?: string }> {
  if (!groundingMetadata) return [];

  const snippetsByIndex = new Map<number, string>();
  for (const support of groundingMetadata.groundingSupports ?? []) {
    const snippet = support.segment?.text?.slice(0, 150);
    if (!snippet) continue;
    for (const index of support.groundingChunkIndices ?? []) {
      if (!snippetsByIndex.has(index)) snippetsByIndex.set(index, snippet);
    }
  }

  return (groundingMetadata.groundingChunks ?? [])
    .map((chunk, index) => {
      if (!chunk.web?.uri) return null;
      return {
        title: chunk.web.title ?? '',
        url: chunk.web.uri,
        domain: domainOf(chunk.web.uri),
        snippet: snippetsByIndex.get(index),
      };
    })
    .filter((source): source is NonNullable<typeof source> => source !== null);
}

function extractSources(
  response: GeminiResponseJson
): Array<{ title: string; url: string; domain: string; snippet?: string }> {
  const deduped = new Map<string, { title: string; url: string; domain: string; snippet?: string }>();
  const extracted = [
    ...extractSourcesFromGroundingMetadata(response.groundingMetadata),
    ...(response.candidates ?? []).flatMap((candidate) =>
      extractSourcesFromGroundingMetadata(candidate.groundingMetadata)
    ),
  ];

  for (const source of extracted) {
    if (!source.url || deduped.has(source.url)) continue;
    deduped.set(source.url, source);
  }

  return Array.from(deduped.values());
}

export async function callGeminiV2Stream(opts: GeminiV2Options): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `${GEMINI_API_BASE}/models/${opts.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const body = JSON.stringify(buildV2Body(opts));

  try {
    return await callWithRetry(
      (timeoutMs) =>
        fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          },
          timeoutMs,
          opts.model
        ),
      {
        ...opts.retryOptions,
        model: opts.model,
        requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULT_GEMINI_STREAM_CONNECT_TIMEOUT_MS,
      }
    );
  } catch (err) {
    if ((err as GeminiError).status) {
      throw err;
    }
    console.error('[Gemini] Stream request failed', {
      model: opts.model,
      error: err instanceof Error ? err.message : String(err),
    });
    throw buildGeminiError(
      opts.model,
      504,
      err instanceof Error ? err.message : 'Stream request failed'
    );
  }
}

export async function callGeminiV2(opts: GeminiV2Options): Promise<GeminiV2NonStreamResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify(buildV2Body(opts));

  let res: Response;
  try {
    res = await callWithRetry(
      (timeoutMs) =>
        fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          },
          timeoutMs,
          opts.model
        ),
      {
        ...opts.retryOptions,
        model: opts.model,
        requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULT_GEMINI_REQUEST_TIMEOUT_MS,
      }
    );
  } catch (err) {
    if ((err as GeminiError).status) {
      throw err;
    }
    console.error('[Gemini] Request failed', {
      model: opts.model,
      error: err instanceof Error ? err.message : String(err),
    });
    throw buildGeminiError(opts.model, 504, err instanceof Error ? err.message : 'Request failed');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Gemini] Non-OK response', {
      model: opts.model,
      status: res.status,
      body: text,
    });
    throw buildGeminiError(opts.model, res.status, text);
  }

  const json = (await res.json()) as GeminiResponseJson;
  maybeLogGroundedResponseShape(json, Boolean(opts.enableSearchGrounding));

  const candidate = json.candidates?.[0];
  const parts: GeminiCandidatePart[] = candidate?.content?.parts ?? [];
  let text = '';
  const functionCalls: GeminiV2FunctionCall[] = [];

  for (const part of parts) {
    if (typeof part.text === 'string') text += part.text;
    if (part.functionCall?.name) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
      });
    }
  }

  const sources = extractSources(json);
  return { text, functionCalls, sources, raw: json };
}

export async function callGeminiV2WithRetry(
  opts: GeminiV2Options
): Promise<GeminiV2NonStreamResult> {
  return callGeminiV2(opts);
}
