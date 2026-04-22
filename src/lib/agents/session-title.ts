import { callGeminiV2, GEMINI_FLASH } from '@/lib/gemini/client';
import { buildSessionTitlePrompt } from './prompts';

/**
 * Generate a 4-6 word title for a chat session.
 *
 * Deviation: The DB has no `chat_sessions` table — sessions are virtual,
 * derived from chat_messages. There is nowhere to persist a title without
 * schema changes (which are out of scope per the spec's DO-NOT-MODIFY list
 * for /supabase/**). Callers should treat the returned title as transient
 * metadata emitted over SSE; Phase 7C can add persistence.
 */
export async function generateSessionTitle(
  userMessage: string,
  assistantResponse: string
): Promise<string> {
  try {
    const body = `User: ${userMessage.slice(0, 400)}\n\nAssistant: ${assistantResponse.slice(0, 400)}`;
    const res = await callGeminiV2({
      model: GEMINI_FLASH,
      systemPrompt: buildSessionTitlePrompt(),
      userMessage: body,
      temperature: 1.0,
      thinking_level: 'low',
      maxOutputTokens: 64,
      requestTimeoutMs: 2000,
      retryOptions: {
        maxRetries: 0,
        backoffMs: 0,
      },
    });
    return cleanTitle(res.text);
  } catch {
    return '';
  }
}

function cleanTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .split('\n')[0]
    .slice(0, 80);
}
