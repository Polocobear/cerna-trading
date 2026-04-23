import { callGeminiV2WithRetry, GEMINI_MODEL } from '@/lib/gemini/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSummaryRecord } from './types';

const MAX_SESSION_CHARS = 1200; // ~300 tokens

const SESSION_SUMMARY_PROMPT = `Summarize this financial advisory conversation in 1-3 sentences. Focus on:
1. What the user wanted to know
2. Key recommendations made
3. Any decisions or next steps agreed upon

Also extract:
- topics: array of topic keywords (e.g., ["dividend stocks", "portfolio rebalancing"])
- tickers: array of stock tickers discussed (e.g., ["BHP", "CBA"])
- sentiment: the overall tone (bullish/bearish/neutral/mixed/concerned)

Respond ONLY with JSON:
{
  "summary": "...",
  "topics": [...],
  "tickers": [...],
  "sentiment": "..."
}`;

type SentimentValue = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'concerned';
const VALID_SENTIMENTS = new Set<string>(['bullish', 'bearish', 'neutral', 'mixed', 'concerned']);

interface DbSummaryRow {
  id: string;
  session_id: string;
  summary: string;
  topics: string[];
  tickers_discussed: string[];
  sentiment: string | null;
  created_at: string;
}

function isDbSummaryRow(obj: unknown): obj is DbSummaryRow {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'summary' in obj;
}

function dbRowToRecord(row: DbSummaryRow): SessionSummaryRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    summary: row.summary,
    topics: row.topics ?? [],
    tickersDiscussed: row.tickers_discussed ?? [],
    sentiment: VALID_SENTIMENTS.has(row.sentiment ?? '') ? row.sentiment as SentimentValue : null,
    createdAt: row.created_at,
  };
}

export async function summarizeSession(
  userId: string,
  sessionId: string,
  messages: Array<{ role: string; content: string }>,
  supabase: SupabaseClient
): Promise<void> {
  if (messages.length === 0) return;

  const formatted = messages
    .slice(-20)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  let summary = '';
  let topics: string[] = [];
  let tickers: string[] = [];
  let sentiment: SentimentValue | null = null;

  try {
    const result = await callGeminiV2WithRetry({
      model: GEMINI_MODEL,
      systemPrompt: 'You summarize financial advisory conversations. Output only valid JSON.',
      userMessage: `${SESSION_SUMMARY_PROMPT}\n\nConversation:\n${formatted}`,
      temperature: 1.0,
      thinking_level: 'low',
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
    });

    const parsed: unknown = JSON.parse(result.text.trim());
    if (typeof parsed === 'object' && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      summary = String(obj.summary ?? '').slice(0, 500);
      topics = Array.isArray(obj.topics)
        ? obj.topics.filter((t): t is string => typeof t === 'string').slice(0, 10)
        : [];
      tickers = Array.isArray(obj.tickers)
        ? obj.tickers.filter((t): t is string => typeof t === 'string').slice(0, 15)
        : [];
      const rawSentiment = String(obj.sentiment ?? '').toLowerCase();
      sentiment = VALID_SENTIMENTS.has(rawSentiment) ? rawSentiment as SentimentValue : 'neutral';
    }
  } catch {
    return;
  }

  if (!summary) return;

  // Upsert: one summary per session
  await supabase
    .from('session_summaries')
    .upsert(
      {
        user_id: userId,
        session_id: sessionId,
        summary,
        topics,
        tickers_discussed: tickers,
        decisions_made: [],
        sentiment,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    );
}

export async function getSessionContext(
  userId: string,
  currentSessionId: string,
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from('session_summaries')
    .select('id, session_id, summary, topics, tickers_discussed, sentiment, created_at')
    .eq('user_id', userId)
    .neq('session_id', currentSessionId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (!Array.isArray(data) || data.length === 0) return '';

  const summaries = data.filter(isDbSummaryRow).map(dbRowToRecord);
  if (summaries.length === 0) return '';

  const lines: string[] = ['## Recent Conversations', ''];

  for (const s of summaries) {
    const date = new Date(s.createdAt);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    let dateLabel: string;
    if (diffDays === 0) {
      dateLabel = `Today, ${date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      dateLabel = `Yesterday`;
    } else if (diffDays < 7) {
      dateLabel = date.toLocaleDateString('en-AU', { weekday: 'long' });
    } else {
      dateLabel = date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
    }

    const sentimentSuffix = s.sentiment ? ` (${s.sentiment})` : '';
    lines.push(`- **${dateLabel}:** ${s.summary}${sentimentSuffix}`);
  }

  lines.push('');
  lines.push('Use this to:');
  lines.push('1. Continue threads from past conversations naturally');
  lines.push('2. Avoid repeating analysis you\'ve already given');
  lines.push('3. Reference past discussions when relevant ("as we discussed on Tuesday...")');

  let result = lines.join('\n').trimEnd();
  if (result.length > MAX_SESSION_CHARS) {
    result = result.slice(0, MAX_SESSION_CHARS) + '\n[Older sessions truncated]';
  }
  return result;
}
