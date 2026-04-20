const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Tiered model routing:
// STANDARD: Gemini 2.5 Pro — free tier (1,500 RPD), strong reasoning
// DEEP:     Gemini 3.1 Pro — paid frontier reasoning for deep analysis
const MODELS = {
  standard: 'gemini-2.5-pro',
  deep: 'gemini-3.1-pro-preview',
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

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
