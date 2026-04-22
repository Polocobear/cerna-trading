import { callGeminiV2, GEMINI_FLASH } from '@/lib/gemini/client';
import { buildFollowUpsPrompt } from './prompts';

const SCHEMA = {
  type: 'ARRAY' as const,
  items: { type: 'STRING' as const },
};

export async function generateFollowUps(
  userQuery: string,
  responseFirst500: string,
  tickers: string[]
): Promise<string[]> {
  const tickerHint = tickers.length > 0 ? `\n\nRelevant tickers: ${tickers.join(', ')}` : '';
  const userMessage = `User asked: "${userQuery}"\n\nAssistant response (first 500 chars):\n${responseFirst500}${tickerHint}\n\nReturn 2-3 follow-up questions as a JSON array of strings.`;

  try {
    const res = await callGeminiV2({
      model: GEMINI_FLASH,
      systemPrompt: buildFollowUpsPrompt(),
      userMessage,
      temperature: 1.0,
      thinking_level: 'low',
      maxOutputTokens: 256,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      requestTimeoutMs: 2500,
      retryOptions: {
        maxRetries: 0,
        backoffMs: 0,
      },
    });

    const text = res.text.trim();
    const parsed = parseFollowUpsArray(text);
    if (parsed.length === 0) return [];
    return parsed.slice(0, 3);
  } catch {
    return [];
  }
}

function parseFollowUpsArray(text: string): string[] {
  // Try strict JSON first
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      return j.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim());
    }
  } catch {
    // fall through
  }
  // Attempt to find a JSON array substring
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      const j = JSON.parse(match[0]);
      if (Array.isArray(j)) {
        return j.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((s) => s.trim());
      }
    } catch {
      // ignore
    }
  }
  return [];
}
