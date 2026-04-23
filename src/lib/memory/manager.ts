import { callGeminiV2WithRetry, GEMINI_MODEL } from '@/lib/gemini/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemoryCategory, MemoryEntry } from './types';

const MAX_MEMORY_CHARS = 2000; // ~500 tokens

const MEMORY_EXTRACTION_PROMPT = `You are analyzing a conversation between a user and their financial AI advisor. Extract any new information about the user that would be valuable to remember for future conversations.

For each piece of information, classify it into exactly one category:
- preference: investment style, stock types they favor, strategies they like/dislike
- goal: financial goals, targets, timelines, retirement plans
- concern: worries, fears, things that make them uncomfortable
- interest: sectors, stocks, themes they're curious about or keep asking about
- context: life situation, income, dependents, job, SMSF details
- behavioral: patterns in how they make decisions, react to advice, timing of actions
- learning: concepts they asked about, things they didn't understand
- feedback: explicit reactions to recommendations ("that was helpful", "too risky")

Only extract information that is CLEARLY stated or strongly implied. Do not infer aggressively.
Rate confidence 0.0-1.0:
- 1.0: explicitly stated ("I prefer dividend stocks")
- 0.7: strongly implied ("show me more dividend options" after multiple dividend queries)
- 0.4: weakly implied (asked about one dividend stock once)

Respond ONLY with a JSON array. No other text.

Example:
[
  {"category": "preference", "content": "Prefers dividend-paying stocks with yields above 4%", "confidence": 1.0},
  {"category": "concern", "content": "Worried about concentration risk in banking sector", "confidence": 0.7}
]

If no new memories should be extracted, return an empty array: []`;

interface ExtractedMemory {
  category: MemoryCategory;
  content: string;
  confidence: number;
}

interface DbMemoryRow {
  id: string;
  category: string;
  content: string;
  confidence: number;
  first_observed: string;
  last_confirmed: string;
  times_referenced: number;
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Investment Preferences',
  goal: 'Goals',
  concern: 'Concerns',
  interest: 'Recurring Interests',
  context: 'Personal Context',
  behavioral: 'Behavioral Patterns',
  learning: 'Knowledge Level',
  feedback: 'Feedback on Recommendations',
};

const VALID_CATEGORIES = new Set<string>([
  'preference', 'goal', 'concern', 'interest',
  'context', 'behavioral', 'learning', 'feedback',
]);

function isValidCategory(c: string): c is MemoryCategory {
  return VALID_CATEGORIES.has(c);
}

function isDbMemoryRow(obj: unknown): obj is DbMemoryRow {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'category' in obj;
}

export async function getMemoryContext(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from('user_memory')
    .select('id, category, content, confidence, first_observed, last_confirmed, times_referenced')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .order('times_referenced', { ascending: false })
    .limit(60);

  if (!data || !Array.isArray(data) || data.length === 0) return '';

  const grouped = new Map<MemoryCategory, string[]>();
  for (const row of data) {
    if (!isDbMemoryRow(row)) continue;
    if (!isValidCategory(row.category)) continue;
    const cat = row.category as MemoryCategory;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(row.content);
  }

  if (grouped.size === 0) return '';

  const lines: string[] = ['## What I Know About You', ''];
  for (const [cat, entries] of grouped) {
    lines.push(`**${CATEGORY_LABELS[cat]}:**`);
    for (const entry of entries) lines.push(`- ${entry}`);
    lines.push('');
  }

  let result = lines.join('\n').trimEnd();
  if (result.length > MAX_MEMORY_CHARS) {
    result = result.slice(0, MAX_MEMORY_CHARS) + '\n- [Additional context truncated]';
  }
  return result;
}

export async function extractMemories(
  userId: string,
  sessionId: string,
  userMessages: string[],
  assistantResponse: string,
  supabase: SupabaseClient
): Promise<MemoryEntry[]> {
  const userBlock = userMessages.join('\n').slice(0, 2000);
  const prompt = `${MEMORY_EXTRACTION_PROMPT}\n\nConversation:\nUser messages: ${userBlock}\nAssistant response: ${assistantResponse.slice(0, 2000)}`;

  let extracted: ExtractedMemory[] = [];
  try {
    const result = await callGeminiV2WithRetry({
      model: GEMINI_MODEL,
      systemPrompt: 'You extract structured memory entries from conversations. Output only valid JSON.',
      userMessage: prompt,
      temperature: 1.0,
      thinking_level: 'low',
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    });

    const parsed: unknown = JSON.parse(result.text.trim());
    if (Array.isArray(parsed)) {
      extracted = parsed
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .filter((item) => isValidCategory(String(item.category ?? '')))
        .map((item) => ({
          category: item.category as MemoryCategory,
          content: String(item.content ?? '').slice(0, 500),
          confidence: Math.min(1, Math.max(0, Number(item.confidence ?? 0.5))),
        }))
        .filter((item) => item.content.length > 10);
    }
  } catch {
    return [];
  }

  const saved: MemoryEntry[] = [];

  for (const mem of extracted) {
    const { data: existing } = await supabase
      .from('user_memory')
      .select('id, times_referenced, confidence')
      .eq('user_id', userId)
      .eq('category', mem.category)
      .eq('content', mem.content)
      .maybeSingle();

    if (existing && isDbMemoryRow(existing)) {
      const newConfidence = Math.min(1, (existing.confidence + mem.confidence) / 2 + 0.1);
      const { data: updated } = await supabase
        .from('user_memory')
        .update({
          last_confirmed: new Date().toISOString(),
          times_referenced: existing.times_referenced + 1,
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('id, category, content, confidence, first_observed, last_confirmed, times_referenced')
        .maybeSingle();

      if (updated && isDbMemoryRow(updated)) {
        saved.push(dbRowToEntry(updated));
      }
    } else {
      const { data: inserted } = await supabase
        .from('user_memory')
        .insert({
          user_id: userId,
          category: mem.category,
          content: mem.content,
          confidence: mem.confidence,
          source_session_id: sessionId,
          first_observed: new Date().toISOString(),
          last_confirmed: new Date().toISOString(),
          times_referenced: 1,
          is_active: true,
        })
        .select('id, category, content, confidence, first_observed, last_confirmed, times_referenced')
        .maybeSingle();

      if (inserted && isDbMemoryRow(inserted)) {
        saved.push(dbRowToEntry(inserted));
      }
    }
  }

  return saved;
}

function dbRowToEntry(row: DbMemoryRow): MemoryEntry {
  return {
    id: row.id,
    category: row.category as MemoryCategory,
    content: row.content,
    confidence: row.confidence,
    firstObserved: row.first_observed,
    lastConfirmed: row.last_confirmed,
    timesReferenced: row.times_referenced,
  };
}

export async function decayMemories(userId: string, supabase: SupabaseClient): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch stale memories
  const { data: stale } = await supabase
    .from('user_memory')
    .select('id, confidence')
    .eq('user_id', userId)
    .eq('is_active', true)
    .lt('last_confirmed', thirtyDaysAgo);

  if (!Array.isArray(stale)) return;

  for (const row of stale) {
    if (typeof row !== 'object' || row === null || !('id' in row) || !('confidence' in row)) continue;
    const id = String(row.id);
    const conf = Number(row.confidence);
    const newConf = conf - 0.1;

    if (newConf < 0.3) {
      await supabase
        .from('user_memory')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
    } else {
      await supabase
        .from('user_memory')
        .update({ confidence: newConf, updated_at: new Date().toISOString() })
        .eq('id', id);
    }
  }
}
