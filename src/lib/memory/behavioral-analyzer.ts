import type { SupabaseClient } from '@supabase/supabase-js';
import type { BehavioralInsight } from './types';

interface DbDecision {
  ticker: string;
  decision_type: string;
  user_acted: boolean;
  user_action: string | null;
  created_at: string;
  user_action_date: string | null;
}

interface DbTrade {
  ticker: string;
  action: string;
  executed_at: string;
}

function isDbDecision(obj: unknown): obj is DbDecision {
  return typeof obj === 'object' && obj !== null && 'ticker' in obj && 'decision_type' in obj;
}

function isDbTrade(obj: unknown): obj is DbTrade {
  return typeof obj === 'object' && obj !== null && 'ticker' in obj && 'action' in obj;
}

export async function analyzeBehavior(
  userId: string,
  supabase: SupabaseClient
): Promise<BehavioralInsight[]> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [decisionsRes, tradesRes] = await Promise.all([
    supabase
      .from('decisions')
      .select('ticker, decision_type, user_acted, user_action, created_at, user_action_date')
      .eq('user_id', userId)
      .gte('created_at', ninetyDaysAgo),
    supabase
      .from('logged_trades')
      .select('ticker, action, executed_at')
      .eq('user_id', userId)
      .gte('executed_at', ninetyDaysAgo),
  ]);

  const decisions = Array.isArray(decisionsRes.data)
    ? decisionsRes.data.filter(isDbDecision)
    : [];
  const trades = Array.isArray(tradesRes.data)
    ? tradesRes.data.filter(isDbTrade)
    : [];

  if (decisions.length < 3) return [];

  const insights: BehavioralInsight[] = [];

  // 1. Follow-through rate
  const acted = decisions.filter((d) => d.user_acted);
  const followRate = (acted.length / decisions.length) * 100;
  if (decisions.length >= 3) {
    const buyRecs = decisions.filter((d) => ['buy', 'add'].includes(d.decision_type));
    const sellRecs = decisions.filter((d) => ['sell', 'trim', 'avoid'].includes(d.decision_type));
    const buyFollowed = buyRecs.filter((d) => d.user_acted).length;
    const sellFollowed = sellRecs.filter((d) => d.user_acted).length;

    if (buyRecs.length >= 2 && sellRecs.length >= 2) {
      const buyRate = Math.round((buyFollowed / buyRecs.length) * 100);
      const sellRate = Math.round((sellFollowed / sellRecs.length) * 100);
      if (Math.abs(buyRate - sellRate) > 20) {
        const higher = buyRate > sellRate ? 'buy' : 'sell';
        const lower = buyRate > sellRate ? 'sell' : 'buy';
        const higherRate = buyRate > sellRate ? buyRate : sellRate;
        const lowerRate = buyRate > sellRate ? sellRate : buyRate;
        insights.push({
          pattern: `Follows ${higher} recommendations ${higherRate}% of the time but only ${lower} recommendations ${lowerRate}% — possible ${lower === 'sell' ? 'loss aversion' : 'risk aversion'}`,
          evidence: `${decisions.length} recommendations analyzed over 90 days`,
          confidence: decisions.length >= 5 ? 0.8 : 0.5,
        });
      }
    } else if (decisions.length >= 3) {
      insights.push({
        pattern: `Acts on approximately ${Math.round(followRate)}% of recommendations`,
        evidence: `${acted.length} of ${decisions.length} recommendations followed`,
        confidence: 0.6,
      });
    }
  }

  // 2. Timing patterns
  const timedDecisions = acted.filter(
    (d) => d.user_action_date && d.created_at
  );
  if (timedDecisions.length >= 3) {
    const delayDays = timedDecisions.map((d) => {
      const recDate = new Date(d.created_at).getTime();
      const actDate = new Date(d.user_action_date!).getTime();
      return (actDate - recDate) / (1000 * 60 * 60 * 24);
    });
    const avgDelay = delayDays.reduce((s, d) => s + d, 0) / delayDays.length;
    if (avgDelay <= 2) {
      insights.push({
        pattern: `Usually acts within 48 hours of a research session`,
        evidence: `Average time from recommendation to trade: ${avgDelay.toFixed(1)} days`,
        confidence: 0.7,
      });
    } else if (avgDelay > 7) {
      insights.push({
        pattern: `Tends to deliberate for a week or more before acting on recommendations`,
        evidence: `Average time from recommendation to trade: ${avgDelay.toFixed(1)} days`,
        confidence: 0.7,
      });
    }
  }

  // 3. Sector/ticker bias from trades
  if (trades.length >= 5) {
    const tickerCount = new Map<string, number>();
    for (const t of trades) {
      tickerCount.set(t.ticker, (tickerCount.get(t.ticker) ?? 0) + 1);
    }
    const repeatedTickers = [...tickerCount.entries()]
      .filter(([, count]) => count >= 3)
      .map(([ticker]) => ticker);

    if (repeatedTickers.length > 0) {
      insights.push({
        pattern: `Shows strong interest in recurring positions: ${repeatedTickers.join(', ')}`,
        evidence: `Each ticker traded 3+ times in the last 90 days`,
        confidence: 0.75,
      });
    }
  }

  return insights;
}

export async function saveBehavioralInsights(
  userId: string,
  insights: BehavioralInsight[],
  supabase: SupabaseClient
): Promise<void> {
  for (const insight of insights) {
    if (insight.confidence < 0.5) continue;

    await supabase
      .from('user_memory')
      .upsert(
        {
          user_id: userId,
          category: 'behavioral',
          content: insight.pattern,
          confidence: insight.confidence,
          last_confirmed: new Date().toISOString(),
          times_referenced: 1,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category,content' }
      );
  }
}

export function formatBehavioralContext(insights: BehavioralInsight[]): string {
  if (insights.length === 0) return '';
  return insights
    .filter((i) => i.confidence >= 0.5)
    .map((i) => `- ${i.pattern}`)
    .join('\n');
}
