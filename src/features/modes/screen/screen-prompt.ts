import type { Position } from '@/types/portfolio';
import type { ModeControls } from '@/types/chat';

export function buildScreenPrompt(portfolio: Position[], controls: ModeControls): string {
  const filterLines: string[] = [];

  if (controls.sector && controls.sector !== 'All') filterLines.push(`Sector: ${controls.sector} only`);
  if (controls.marketCap && controls.marketCap !== 'All') filterLines.push(`Market cap: ${controls.marketCap}`);

  if (controls.maxPE) filterLines.push(`P/E ratio must be below ${controls.maxPE}x`);
  if (controls.maxPB) filterLines.push(`P/B ratio must be below ${controls.maxPB}x`);
  if (controls.maxPEG) filterLines.push(`PEG ratio must be below ${controls.maxPEG}x`);
  if (controls.minEPSGrowth) filterLines.push(`EPS growth must be at least ${controls.minEPSGrowth}% YoY`);
  if (controls.minRevenueGrowth)
    filterLines.push(`Revenue growth must be at least ${controls.minRevenueGrowth}% YoY`);
  if (controls.minDividendYield)
    filterLines.push(`Dividend yield must be at least ${controls.minDividendYield}%`);
  if (controls.maxPayoutRatio)
    filterLines.push(`Dividend payout ratio must be below ${controls.maxPayoutRatio}%`);
  if (controls.maxDebtEquity)
    filterLines.push(`Debt-to-equity ratio must be below ${controls.maxDebtEquity}x`);
  if (controls.minROE) filterLines.push(`Return on equity must be at least ${controls.minROE}%`);
  if (controls.positiveFCF)
    filterLines.push(`Must have positive free cash flow in the latest reporting period`);
  if (controls.minAnalystConsensus && controls.minAnalystConsensus !== 'any') {
    filterLines.push(`Analyst consensus must be "${controls.minAnalystConsensus}" or better`);
  }
  if (controls.minPriceTargetUpside) {
    filterLines.push(
      `Mean analyst price target must be at least ${controls.minPriceTargetUpside}% above current price`
    );
  }
  if (controls.above200MA) filterLines.push(`Price must be above the 200-day moving average`);
  if (controls.above50MA) filterLines.push(`Price must be above the 50-day moving average`);
  if (controls.rsiRange === 'oversold')
    filterLines.push(`RSI(14) must be below 30 (oversold territory)`);
  if (controls.rsiRange === 'neutral') filterLines.push(`RSI(14) must be between 30 and 70`);
  if (controls.rsiRange === 'overbought')
    filterLines.push(`RSI(14) must be above 70 (showing strong momentum)`);

  const numCandidates = controls.depth === 'deep' ? 5 : 3;
  const filterBlock =
    filterLines.length > 0
      ? `\n\nSCREENING CRITERIA (apply ALL of these):\n${filterLines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
      : '';

  const heldTickers = portfolio.map((p) => p.ticker).join(', ') || 'none';
  const portfolioJson = JSON.stringify(
    portfolio.map((p) => ({ ticker: p.ticker, shares: p.shares, cost_basis: p.cost_basis }))
  );

  return `You are Cerna Trading, a value investing analyst for Australian retail investors.

The user manages an SMSF portfolio. They are screening for stock opportunities using a "${controls.strategy ?? 'value'}" strategy.

PORTFOLIO CONTEXT (do not repeat back, use to avoid duplicates and assess fit):
Held tickers: ${heldTickers}
Positions: ${portfolioJson}
${filterBlock}

ADDITIONAL REQUIREMENTS:
- Must be listed on ASX (SMSF compliance — no unlisted assets)
- Market cap above $100M (liquidity for SMSF)
- Do NOT recommend stocks the user already holds

For each candidate, provide a STRUCTURED ANALYSIS with these sections:

**[TICKER] — [Company Name]**
- Current Price: $XX.XX | 52-Week Range: $XX.XX - $XX.XX
- Market Cap: $X.XB

Valuation:
- P/E: XX.X (vs sector median XX.X) | Forward P/E: XX.X
- P/B: X.XX | PEG: X.XX
- EV/EBITDA: XX.X

Growth:
- EPS Growth (YoY): XX.X% | Revenue Growth (YoY): XX.X%
- 3-Year EPS CAGR: XX.X%

Income:
- Dividend Yield: X.XX% | Payout Ratio: XX%
- Ex-Dividend Date: [date if upcoming]

Financial Health:
- Debt/Equity: X.XX | Interest Coverage: XX.Xx
- ROE: XX.X% | ROA: XX.X%
- Free Cash Flow: $XXM (positive/negative trend)

Analyst View:
- Consensus: [Strong Buy / Buy / Hold / Sell] (X analysts)
- Mean Price Target: $XX.XX (XX% upside/downside)
- Recent Estimate Revisions: [up/down/stable]

Technical:
- vs 200-day MA: [above/below] by XX%
- vs 50-day MA: [above/below] by XX%
- RSI(14): XX.X

Why It Fits Your Portfolio:
[1-2 sentences on diversification benefit, sector exposure, correlation with existing holdings]

Key Risk:
[1 sentence on the primary downside risk]

Present ${numCandidates} candidates maximum. Quality over quantity.
If a metric is unavailable, write "N/A" — do not guess.
Cite all data sources inline.
End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
}
