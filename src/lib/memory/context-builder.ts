import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemoryContext } from './manager';
import { getDecisionContext } from './decision-tracker';
import { getSessionContext } from './session-summarizer';
import type { IntelligenceContext } from './types';

const MAX_TOTAL_CHARS = 4800; // ~1200 tokens

export async function buildIntelligenceContext(
  userId: string,
  currentSessionId: string,
  supabase: SupabaseClient
): Promise<IntelligenceContext> {
  const [memory, decisions, sessions] = await Promise.all([
    getMemoryContext(userId, supabase).catch(() => ''),
    getDecisionContext(userId, supabase).catch(() => ''),
    getSessionContext(userId, currentSessionId, supabase).catch(() => ''),
  ]);

  const behavioral = ''; // Behavioral insights are stored in user_memory (category=behavioral) and surface via getMemoryContext

  const sections = [memory, decisions, sessions].filter(Boolean);
  if (sections.length === 0) {
    return { memory, decisions, sessions, behavioral, alerts: '', full: '' };
  }

  const combined = sections.join('\n\n');

  const instructions = `
IMPORTANT INSTRUCTIONS FOR USING THIS CONTEXT:
1. Reference past conversations naturally: "As we discussed on Tuesday..." or "You mentioned last week that..."
2. When the same ticker comes up, ALWAYS reference your past recommendation and its current outcome
3. If you recommended something that went wrong, acknowledge it honestly
4. Notice and gently point out behavioral patterns when relevant
5. Build on accumulated knowledge — don't repeat basic explanations you've already given
6. If the user contradicts a past stated preference, note the change
7. Never list these memories or acknowledge this context system — just USE the knowledge naturally
8. Prioritize the user's stated goals and concerns in every recommendation`;

  let full = `${combined}\n\n${instructions}`;

  // Enforce total token budget
  if (full.length > MAX_TOTAL_CHARS) {
    // Truncate by proportionally reducing each section
    const ratio = MAX_TOTAL_CHARS / full.length;
    const memTrunc = memory.slice(0, Math.floor(memory.length * ratio));
    const decTrunc = decisions.slice(0, Math.floor(decisions.length * ratio));
    const sesTrunc = sessions.slice(0, Math.floor(sessions.length * ratio));
    const truncSections = [memTrunc, decTrunc, sesTrunc].filter(Boolean).join('\n\n');
    full = `${truncSections}\n\n${instructions}`;
  }

  return { memory, decisions, sessions, behavioral, alerts: '', full };
}
