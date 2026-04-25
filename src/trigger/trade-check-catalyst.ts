import { metadata, task } from '@trigger.dev/sdk/v3';
import { executeCatalystStep } from '@/lib/agents/trade-check-executor';
import type {
  TradeCheckCatalystResult,
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

export const tradeCheckCatalystTask = task({
  id: 'trade-check-catalyst',
  retry: {
    maxAttempts: 1,
  },
  run: async (
    payload: TradeCheckTaskPayload
  ): Promise<TradeCheckTaskOutput<TradeCheckCatalystResult>> => {
    const startedAt = Date.now();
    metadata.set('userId', payload.userId);
    metadata.set('ticker', payload.ticker);
    metadata.set('step', 'catalyst');
    setStage('running', `Searching for catalysts on ${payload.ticker}...`, 0);

    const progressInterval = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const message =
        elapsedMs < 20_000
          ? `Searching for catalysts on ${payload.ticker}...`
          : elapsedMs < 60_000
            ? `Reviewing events, timing, and market narrative for ${payload.ticker}...`
            : `Finalizing the catalyst view for ${payload.ticker}...`;
      setStage('running', message, elapsedMs);
    }, 5000);

    try {
      const result = await executeCatalystStep({
        ticker: payload.ticker,
        requestedAction: payload.requestedAction,
        context: payload.context,
        extraContext: payload.extraContext,
      });

      setStage(
        result.success ? 'complete' : 'error',
        result.success ? 'Catalyst review complete.' : result.error ?? 'Catalyst review failed.',
        Date.now() - startedAt
      );
      return result;
    } finally {
      clearInterval(progressInterval);
    }
  },
});
