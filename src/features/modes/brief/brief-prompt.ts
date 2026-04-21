import type { Position, WatchlistItem } from '@/types/portfolio';
import type { ModeControls } from '@/types/chat';
import { buildPortfolioReportPrompt } from '@/features/modes/analyze/analyze-prompt';

const FOCUS_INSTRUCTION: Record<string, string> = {
  everything: 'Cover company news, earnings, macro context, and recent analyst actions.',
  earnings: 'Focus exclusively on upcoming/recent earnings reports and analyst estimate revisions.',
  news: 'Focus exclusively on company-specific news and press releases — skip macro and analyst actions.',
  macro: 'Focus on macro factors: central bank moves, major index action, FX, commodities, sector rotation, global markets. Tie each point back to portfolio impact.',
  analyst: 'Focus on recent upgrades, downgrades, target changes, and new coverage initiations.',
  dividends: 'Focus on upcoming ex-dividend dates, yield changes, and payout announcements.',
};

export function buildBriefPrompt(
  portfolio: Position[],
  watchlist: WatchlistItem[],
  controls: ModeControls
): string {
  if (controls.focus === 'portfolio_health') {
    return buildPortfolioReportPrompt(portfolio, 0);
  }

  const scope = controls.scope ?? 'holdings';
  const wordLimit = controls.depth === 'deep' ? 500 : 200;
  const focus = controls.focus ?? 'everything';

  const holdings = portfolio.map((p) => p.ticker).join(', ') || 'none';
  const watching = watchlist.map((w) => w.ticker).join(', ') || 'none';

  const subjects = scope === 'watchlist' ? `watchlist: ${watching}` : `holdings: ${holdings}`;
  const focusLine = FOCUS_INSTRUCTION[focus] ?? FOCUS_INSTRUCTION.everything;

  return `You are Cerna Trading, a value investing analyst for Australian retail investors.

Deliver a morning intelligence brief focused on the user's ${subjects}.

Focus: ${focusLine}

Search overnight and recent news. Skip tickers with no meaningful news.

Structure the brief with these sections (markdown headings):
## Market Context
Overall market direction, FX, commodities if relevant.

## Holdings Update
Per-ticker news with impact assessment.

## Watchlist Signals
Any price or news triggers on watchlist names.

## Action Items
Concrete decisions the user should consider today.

Keep the total under ${wordLimit} words. Cite all sources inline.

End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
}
