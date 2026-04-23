import { callClaude, CLAUDE_HAIKU, parseClaudeJson } from '@/lib/claude/client';
import { fetchPricesForTickers } from '@/lib/prices/server-fetch';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Decision, DecisionType, DecisionConfidence, OutcomeStatus } from './types';

const MAX_DECISION_CHARS = 1600; // ~400 tokens

const DECISION_EXTRACTION_PROMPT = `Analyze this financial advisor response and extract any specific, actionable recommendations made.

Only extract recommendations that include:
1. A specific ticker/stock
2. A clear action (buy, sell, hold, avoid, watch, trim, add)
3. Some reasoning

Do NOT extract:
- Vague suggestions ("you might want to look into...")
- General market commentary without specific stock action
- Educational explanations

For each recommendation, extract:
- ticker: stock symbol (uppercase)
- decision_type: buy/sell/hold/avoid/watch/trim/add/rebalance
- reasoning: 1-2 sentence summary of why
- target_price: if mentioned (null otherwise)
- stop_loss: if mentioned (null otherwise)
- timeframe: if mentioned ("1 week", "before earnings", etc.)
- confidence: low/medium/high based on language strength

Respond ONLY with a JSON array. Empty array if no actionable recommendations.`;

interface RawDecision {
  ticker?: unknown;
  decision_type?: unknown;
  reasoning?: unknown;
  target_price?: unknown;
  stop_loss?: unknown;
  timeframe?: unknown;
  confidence?: unknown;
}

interface DbDecisionRow {
  id: string;
  session_id: string | null;
  decision_type: string;
  ticker: string;
  reasoning: string;
  price_at_decision: number | null;
  target_price: number | null;
  stop_loss: number | null;
  timeframe: string | null;
  confidence: string | null;
  outcome_status: string;
  price_at_review: number | null;
  return_pct: number | null;
  outcome_notes: string | null;
  reviewed_at: string | null;
  user_acted: boolean;
  user_action: string | null;
  user_action_date: string | null;
  created_at: string;
}

const VALID_DECISION_TYPES = new Set<string>([
  'buy', 'sell', 'hold', 'avoid', 'watch', 'trim', 'add', 'rebalance',
]);

const VALID_CONFIDENCE = new Set<string>(['low', 'medium', 'high']);

function isDbDecisionRow(obj: unknown): obj is DbDecisionRow {
  return typeof obj === 'object' && obj !== null && 'id' in obj && 'ticker' in obj;
}

function dbRowToDecision(row: DbDecisionRow): Decision {
  return {
    id: row.id,
    sessionId: row.session_id,
    decisionType: row.decision_type as DecisionType,
    ticker: row.ticker,
    reasoning: row.reasoning,
    priceAtDecision: row.price_at_decision,
    targetPrice: row.target_price,
    stopLoss: row.stop_loss,
    timeframe: row.timeframe,
    confidence: VALID_CONFIDENCE.has(row.confidence ?? '') ? row.confidence as DecisionConfidence : null,
    outcomeStatus: row.outcome_status as OutcomeStatus,
    priceAtReview: row.price_at_review,
    returnPct: row.return_pct,
    outcomeNotes: row.outcome_notes,
    reviewedAt: row.reviewed_at,
    userActed: row.user_acted,
    userAction: row.user_action,
    userActionDate: row.user_action_date,
    createdAt: row.created_at,
  };
}

export async function extractDecisions(
  userId: string,
  sessionId: string,
  response: string,
  supabase: SupabaseClient
): Promise<Decision[]> {
  let rawDecisions: RawDecision[] = [];

  try {
    const result = await callClaude({
      model: CLAUDE_HAIKU,
      systemPrompt: 'You extract actionable investment recommendations from financial advisor responses. Output only valid JSON.',
      userMessage: `${DECISION_EXTRACTION_PROMPT}\n\nResponse to analyze:\n${response.slice(0, 3000)}`,
      useWebSearch: false,
      maxTokens: 2048,
      thinkingBudget: 0,
      temperature: 1,
    });

    const parsed = parseClaudeJson<unknown>(result.text);
    if (Array.isArray(parsed)) {
      rawDecisions = parsed.filter(
        (item): item is RawDecision => typeof item === 'object' && item !== null
      );
    }
  } catch {
    return [];
  }

  if (rawDecisions.length === 0) return [];

  // Fetch current prices for all extracted tickers
  const tickers = rawDecisions
    .map((d) => String(d.ticker ?? '').toUpperCase())
    .filter((t) => t.length >= 2 && t.length <= 6);
  const prices = await fetchPricesForTickers(tickers.map((t) => ({ ticker: t })));

  const saved: Decision[] = [];

  for (const raw of rawDecisions) {
    const ticker = String(raw.ticker ?? '').toUpperCase();
    if (!ticker || ticker.length < 2) continue;

    const decisionType = String(raw.decision_type ?? '').toLowerCase();
    if (!VALID_DECISION_TYPES.has(decisionType)) continue;

    const reasoning = String(raw.reasoning ?? '').slice(0, 500);
    if (!reasoning) continue;

    const confidence = String(raw.confidence ?? '').toLowerCase();
    const priceData = prices[ticker];

    const { data: inserted } = await supabase
      .from('decisions')
      .insert({
        user_id: userId,
        session_id: sessionId,
        decision_type: decisionType,
        ticker,
        reasoning,
        price_at_decision: priceData?.price ?? null,
        target_price: raw.target_price != null ? Number(raw.target_price) : null,
        stop_loss: raw.stop_loss != null ? Number(raw.stop_loss) : null,
        timeframe: raw.timeframe != null ? String(raw.timeframe).slice(0, 100) : null,
        confidence: VALID_CONFIDENCE.has(confidence) ? confidence : null,
        outcome_status: 'pending',
        user_acted: false,
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (inserted && isDbDecisionRow(inserted)) {
      saved.push(dbRowToDecision(inserted));
    }
  }

  return saved;
}

export async function getDecisionContext(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from('decisions')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!Array.isArray(data) || data.length === 0) return '';

  const decisions = data.filter(isDbDecisionRow).map(dbRowToDecision);
  if (decisions.length === 0) return '';

  // Fetch current prices for pending decisions
  const pendingTickers = decisions
    .filter((d) => d.outcomeStatus === 'pending' && d.priceAtDecision != null)
    .map((d) => ({ ticker: d.ticker }));
  const currentPrices = pendingTickers.length > 0
    ? await fetchPricesForTickers(pendingTickers)
    : {};

  const lines: string[] = ['## My Past Recommendations', ''];

  const active = decisions.filter((d) => d.outcomeStatus === 'pending');
  if (active.length > 0) {
    lines.push('**Active recommendations:**');
    for (const d of active.slice(0, 8)) {
      const date = new Date(d.createdAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
      const priceInfo = d.priceAtDecision
        ? ` at $${d.priceAtDecision.toFixed(2)}`
        : '';
      const current = currentPrices[d.ticker];
      let returnStr = '';
      if (current && d.priceAtDecision) {
        const pct = ((current.price - d.priceAtDecision) / d.priceAtDecision) * 100;
        const sign = pct >= 0 ? '+' : '';
        returnStr = ` (currently $${current.price.toFixed(2)}, ${sign}${pct.toFixed(1)}%)`;
      }
      lines.push(`- ${d.ticker}: Recommended ${d.decisionType.toUpperCase()} on ${date}${priceInfo}${returnStr}. ${d.reasoning}`);
    }
    lines.push('');
  }

  // Track record summary
  const total = decisions.length;
  const correct = decisions.filter((d) => d.outcomeStatus === 'correct').length;
  const incorrect = decisions.filter((d) => d.outcomeStatus === 'incorrect').length;
  const pending = decisions.filter((d) => d.outcomeStatus === 'pending').length;

  if (total > 0) {
    lines.push('**Track record (last 30 days):**');
    lines.push(`- ${total} recommendations total: ${correct} correct, ${incorrect} incorrect, ${pending} pending`);

    const resolved = decisions.filter((d) => d.returnPct != null);
    if (resolved.length > 0) {
      const avgReturn = resolved.reduce((s, d) => s + (d.returnPct ?? 0), 0) / resolved.length;
      lines.push(`- Average return on resolved recommendations: ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%`);
    }
    lines.push('');
  }

  let result = lines.join('\n').trimEnd();
  if (result.length > MAX_DECISION_CHARS) {
    result = result.slice(0, MAX_DECISION_CHARS) + '\n[Older recommendations truncated]';
  }
  return result;
}

export async function reviewDecisions(
  userId: string,
  supabase: SupabaseClient
): Promise<Decision[]> {
  const { data } = await supabase
    .from('decisions')
    .select('*')
    .eq('user_id', userId)
    .eq('outcome_status', 'pending');

  if (!Array.isArray(data) || data.length === 0) return [];

  const decisions = data.filter(isDbDecisionRow).map(dbRowToDecision);
  const tickers = [...new Set(decisions.map((d) => d.ticker))];
  const prices = await fetchPricesForTickers(tickers.map((t) => ({ ticker: t })));

  const updated: Decision[] = [];

  for (const d of decisions) {
    const current = prices[d.ticker];
    if (!current || d.priceAtDecision == null) continue;

    const returnPct = ((current.price - d.priceAtDecision) / d.priceAtDecision) * 100;
    const createdAt = new Date(d.createdAt).getTime();
    const ageMs = Date.now() - createdAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // Parse timeframe to days
    let timeframeDays: number | null = null;
    if (d.timeframe) {
      const match = d.timeframe.match(/(\d+)\s*(day|week|month)/i);
      if (match) {
        const n = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('d')) timeframeDays = n;
        else if (unit.startsWith('w')) timeframeDays = n * 7;
        else if (unit.startsWith('m')) timeframeDays = n * 30;
      }
    }

    let newStatus: OutcomeStatus = 'pending';

    if (timeframeDays && ageDays > timeframeDays) {
      newStatus = 'expired';
    } else if (['buy', 'add'].includes(d.decisionType)) {
      if (returnPct > 10) newStatus = 'correct';
      else if (returnPct < -10) newStatus = 'incorrect';
    } else if (['sell', 'avoid', 'trim'].includes(d.decisionType)) {
      if (returnPct < -10) newStatus = 'correct';
      else if (returnPct > 10) newStatus = 'incorrect';
    }

    if (newStatus !== 'pending') {
      const { data: up } = await supabase
        .from('decisions')
        .update({
          outcome_status: newStatus,
          price_at_review: current.price,
          return_pct: returnPct,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', d.id)
        .select('*')
        .maybeSingle();

      if (up && isDbDecisionRow(up)) updated.push(dbRowToDecision(up));
    }
  }

  return updated;
}

export async function matchDecisionsToTrades(
  userId: string,
  supabase: SupabaseClient
): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: unmatched } = await supabase
    .from('decisions')
    .select('id, ticker, decision_type, created_at')
    .eq('user_id', userId)
    .eq('user_acted', false);

  if (!Array.isArray(unmatched) || unmatched.length === 0) return;

  const { data: trades } = await supabase
    .from('logged_trades')
    .select('ticker, action, executed_at')
    .eq('user_id', userId)
    .gte('executed_at', sevenDaysAgo);

  if (!Array.isArray(trades) || trades.length === 0) return;

  for (const d of unmatched) {
    if (typeof d !== 'object' || d === null) continue;
    const ticker = String((d as Record<string, unknown>).ticker ?? '');
    const decisionType = String((d as Record<string, unknown>).decision_type ?? '');
    const createdAt = String((d as Record<string, unknown>).created_at ?? '');
    const id = String((d as Record<string, unknown>).id ?? '');

    const decisionDate = new Date(createdAt).getTime();

    for (const t of trades) {
      if (typeof t !== 'object' || t === null) continue;
      const tradeTicker = String((t as Record<string, unknown>).ticker ?? '');
      const tradeAction = String((t as Record<string, unknown>).action ?? '');
      const tradeDate = new Date(String((t as Record<string, unknown>).executed_at ?? '')).getTime();

      if (
        tradeTicker.toUpperCase() === ticker.toUpperCase() &&
        tradeDate >= decisionDate
      ) {
        const sameDirection = tradeAction === decisionType ||
          (decisionType === 'buy' && tradeAction === 'buy') ||
          (decisionType === 'add' && tradeAction === 'add') ||
          (decisionType === 'sell' && tradeAction === 'sell') ||
          (decisionType === 'trim' && tradeAction === 'trim');

        await supabase
          .from('decisions')
          .update({
            user_acted: true,
            user_action: sameDirection ? decisionType : tradeAction,
            user_action_date: (t as Record<string, unknown>).executed_at,
          })
          .eq('id', id);
        break;
      }
    }
  }
}
