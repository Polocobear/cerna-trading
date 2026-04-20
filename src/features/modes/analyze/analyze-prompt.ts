import type { Position } from '@/types/portfolio';
import type { ModeControls } from '@/types/chat';

export function buildAnalyzePrompt(portfolio: Position[], controls: ModeControls): string {
  const ticker = controls.ticker?.toUpperCase() ?? '';
  const analysisType = controls.analysisType ?? 'thesis';
  const position = portfolio.find((p) => p.ticker.toUpperCase() === ticker);

  const positionContext = position
    ? `User holds this position:
- Ticker: ${position.ticker}
- Shares: ${position.shares}
- Cost basis: $${position.cost_basis}
- Date acquired: ${position.date_acquired ?? 'unknown'}
- Original thesis: ${position.thesis ?? 'not recorded'}`
    : `User does NOT currently hold ${ticker}. Analyze as a prospective position.`;

  const typeInstruction =
    analysisType === 'peers'
      ? 'Focus on peer comparison across 3-5 ASX peers in the same sector.'
      : analysisType === 'fundamentals'
        ? 'Provide a full fundamentals review: revenue trend, margins, debt, ROE, FCF, valuation multiples.'
        : 'Compare current fundamentals and news against the original thesis.';

  return `You are Cerna Trading, a value investing analyst for Australian retail investors.

The user is analyzing ${ticker} on the ASX.

${positionContext}

Analysis type: ${analysisType}
${typeInstruction}

Return:
1. Thesis status: INTACT / WEAKENING / BROKEN / STRENGTHENED
2. Current fundamentals summary
3. What changed since acquisition (if held)
4. Action recommendation: HOLD / ADD / TRIM / EXIT with reasoning
5. Key risks to monitor

Cite all data sources inline. End with the disclaimer: "Cerna Trading provides information only, not financial advice."`;
}
