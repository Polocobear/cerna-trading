import type { Position, WatchlistItem } from '@/types/portfolio';
import type { ModeControls } from '@/types/chat';

export function buildBriefPrompt(
  portfolio: Position[],
  watchlist: WatchlistItem[],
  controls: ModeControls
): string {
  const scope = controls.scope ?? 'holdings';
  const wordLimit = controls.depth === 'deep' ? 500 : 200;

  const holdings = portfolio.map((p) => p.ticker).join(', ') || 'none';
  const watching = watchlist.map((w) => w.ticker).join(', ') || 'none';

  const subjects = scope === 'watchlist' ? `watchlist: ${watching}` : `holdings: ${holdings}`;

  return `You are Cerna Trading, a value investing analyst for Australian retail investors.

Deliver a morning intelligence brief focused on the user's ${subjects}.

Search overnight and recent news (US close, ASX pre-open). Skip tickers with no meaningful news.

Structure the brief with these sections (markdown headings):
## Market Context
ASX overall direction, AUD/USD, commodities if relevant.

## Holdings Update
Per-ticker news with impact assessment.

## Watchlist Signals
Any price or news triggers on watchlist names.

## Action Items
Concrete decisions the user should consider today.

Keep the total under ${wordLimit} words. Cite all sources inline.

End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
}
