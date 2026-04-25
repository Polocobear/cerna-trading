import { metadata, task } from '@trigger.dev/sdk/v3';
import { executeFundamentalsStep } from '@/lib/agents/trade-check-executor';
import type {
  TradeCheckFundamentalsResult,
  TradeCheckTaskOutput,
  TradeCheckTaskPayload,
} from '@/lib/agents/trade-check-types';

function setStage(stage: string, message: string, elapsedMs: number): void {
  metadata.set('status', stage);
  metadata.set('agentStatus', stage);
  metadata.set('agentStatusMessage', message);
  metadata.set('stage', message);
  metadata.set('elapsedMs', elapsedMs);
}

export const tradeCheckFundamentalsTask = task({
  id: 'trade-check-fundamentals',
  retry: {
    maxAttempts: 1,
  },
  run: async (
    payload: TradeCheckTaskPayload
  ): Promise<TradeCheckTaskOutput<TradeCheckFundamentalsResult>> => {
    const startedAt = Date.now();
    metadata.set('userId', payload.userId);
    metadata.set('ticker', payload.ticker);
    metadata.set('step', 'fundamentals');
    setStage('running', `Reviewing ${payload.ticker} fundamentals...`, 0);

    const progressInterval = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const message =
        elapsedMs < 20_000
          ? `Reviewing ${payload.ticker} fundamentals...`
          : elapsedMs < 60_000
            ? `Pulling valuation and balance-sheet data for ${payload.ticker}...`
            : `Finishing the fundamentals view for ${payload.ticker}...`;
      setStage('running', message, elapsedMs);
    }, 5000);

    try {
      const result = await executeFundamentalsStep({
        ticker: payload.ticker,
        requestedAction: payload.requestedAction,
        context: payload.context,
        extraContext: payload.extraContext,
      });

      setStage(
        result.success ? 'complete' : 'error',
        result.success ? 'Fundamentals complete.' : result.error ?? 'Fundamentals failed.',
        Date.now() - startedAt
      );
      return result;
    } finally {
      clearInterval(progressInterval);
    }
  },
});
