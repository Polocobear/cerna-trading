import { callClaude, CLAUDE_HAIKU, parseClaudeJson } from '@/lib/claude/client';
import { buildFollowUpsPrompt } from './prompts';

export async function generateFollowUps(
  userQuery: string,
  responseFirst500: string,
  tickers: string[]
): Promise<string[]> {
  const tickerHint = tickers.length > 0 ? `\n\nRelevant tickers: ${tickers.join(', ')}` : '';
  const userMessage = `User asked: "${userQuery}"\n\nAssistant response (first 500 chars):\n${responseFirst500}${tickerHint}\n\nReturn 2-3 follow-up questions as a JSON array of strings.`;

  try {
    const response = await callClaude({
      model: CLAUDE_HAIKU,
      systemPrompt: buildFollowUpsPrompt(),
      userMessage,
      useWebSearch: false,
      maxTokens: 256,
      thinkingBudget: 0,
      temperature: 1,
    });

    const parsed = parseFollowUpsArray(response.text);
    if (parsed.length === 0) return [];
    return parsed.slice(0, 3);
  } catch {
    return [];
  }
}

function parseFollowUpsArray(text: string): string[] {
  const parsed = parseClaudeJson<unknown>(text);
  if (Array.isArray(parsed)) {
    return parsed
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
  }
  return [];
}
