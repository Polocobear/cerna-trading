const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Tiered model routing (legacy callGemini):
// STANDARD: Gemini 2.5 Pro — free tier (1,500 RPD), strong reasoning
// DEEP:     Gemini 3.1 Pro — paid frontier reasoning for deep analysis
const MODELS = {
  standard: 'gemini-2.5-pro',
  deep: 'gemini-2.5-pro',
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

export interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
  webSearchQueries?: string[];
}

/**
 * Legacy callGemini used by /api/chat. Streams 2.5/3.1 Pro with search grounding.
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
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: tier === 'deep' ? 0.4 : 0.7,
      maxOutputTokens: tier === 'deep' ? 8192 : 4096,
    },
  };

  const url = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  return callWithRetry(() =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

// =============================================================================
// v2 API used by the Phase 7B agent backend.
// =============================================================================

export type GeminiV2Model = 'gemini-2.5-pro' | 'gemini-2.5-flash';

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
  maxOutputTokens?: number;
}

export interface GeminiV2FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiV2NonStreamResult {
  text: string;
  functionCalls: GeminiV2FunctionCall[];
  sources: Array<{ title: string; url: string; domain: string }>;
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

export async function callWithRetry(
  fn: () => Promise<Response>,
  options?: {
    maxRetries?: number;
    backoffMs?: number;
    downgradeModel?: string;
  }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2;
  const backoffMs = options?.backoffMs ?? 2000;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await fn();

    if (res.ok) return res;

    if (!isRetryableStatus(res.status) || attempt === maxRetries) {
      return res;
    }

    const jitter = Math.random() * 500;
    await wait(backoffMs * (attempt + 1) + jitter);
  }

  return fn();
}

export function sanitizeGeminiError(status: number, rawText: string): string {
  const normalized = rawText.toLowerCase();

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

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Gemini disallows mixing googleSearch with functionDeclarations in the same
  // request. Caller must choose one. Orchestrator uses tools; agents use search.
  const tools: Array<Record<string, unknown>> = [];
  if (opts.tools && opts.tools.length > 0) {
    tools.push({ functionDeclarations: opts.tools });
  } else if (opts.enableSearchGrounding) {
    tools.push({ googleSearch: {} });
  }

  const generationConfig: Record<string, unknown> = {
    temperature: opts.temperature ?? 0.6,
    maxOutputTokens: opts.maxOutputTokens ?? 4096,
  };
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

export async function callGeminiV2Stream(opts: GeminiV2Options): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `${GEMINI_API_BASE}/models/${opts.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildV2Body(opts)),
  });
}

export async function callGeminiV2(opts: GeminiV2Options): Promise<GeminiV2NonStreamResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `${GEMINI_API_BASE}/models/${opts.model}:generateContent?key=${apiKey}`;
  const body = JSON.stringify(buildV2Body(opts));
  const res = await callWithRetry(() =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[Gemini] Non-OK response', {
      model: opts.model,
      status: res.status,
      body: text,
    });
    const err = new Error(sanitizeGeminiError(res.status, text)) as Error & {
      status?: number;
      rawText?: string;
      model?: string;
    };
    err.status = res.status;
    err.rawText = text;
    err.model = opts.model;
    throw err;
  }
  const json = (await res.json()) as GeminiResponseJson;
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
  const grounding = candidate?.groundingMetadata;
  const sources = (grounding?.groundingChunks ?? [])
    .filter((c) => c.web?.uri)
    .map((c) => ({
      title: c.web?.title ?? '',
      url: c.web?.uri ?? '',
      domain: domainOf(c.web?.uri ?? ''),
    }));
  return { text, functionCalls, sources, raw: json };
}

export async function callGeminiV2WithRetry(
  opts: GeminiV2Options
): Promise<GeminiV2NonStreamResult> {
  return callGeminiV2(opts);
}
