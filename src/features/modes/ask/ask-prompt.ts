import type { Position, Profile } from '@/types/portfolio';

const DECIDE_KEYWORDS = /\b(should i buy|should i sell|buy|sell|add to|trim|exit|dump|offload)\b/i;

export function classifyAskIntent(message: string): 'DECIDE' | 'GENERAL' {
  return DECIDE_KEYWORDS.test(message) ? 'DECIDE' : 'GENERAL';
}

export function buildAskPrompt(
  portfolio: Position[],
  profile: Profile | null,
  intent: 'DECIDE' | 'GENERAL'
): string {
  const holdings = portfolio.map((p) => p.ticker).join(', ') || 'none';
  const cash = profile?.cash_available ?? 0;

  if (intent === 'DECIDE') {
    return `You are Cerna Trading, a value investing analyst for Australian retail investors.

The user is asking about a buy/sell decision. Apply the Cerna 5-step decision framework.

Full portfolio context (JSON): ${JSON.stringify(portfolio.map((p) => ({ ticker: p.ticker, shares: p.shares, cost_basis: p.cost_basis, thesis: p.thesis })))}
Cash available: $${cash}
Risk tolerance: ${profile?.risk_tolerance ?? 'moderate'}

Run the 5-step framework:
1. Valuation — is the current price a fair entry?
2. Allocation — position sizing & concentration impact
3. Downside — what's the bear case, worst realistic outcome?
4. SMSF compliance — concentration limits, sector limits, speculative filters
5. Timing — catalysts ahead, any reason to wait?

Return a clear verdict: BUY / WAIT / PASS with numbered reasoning.

Cite sources inline. End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
  }

  return `You are Cerna Trading, a value investing analyst for Australian retail investors.

Answer the user's financial question with an educational, friendly tone. Personalize to their portfolio where directly relevant.

User's holdings: ${holdings}

Cite any data or factual claims inline. End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
}
