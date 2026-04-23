import { metadata } from '@trigger.dev/sdk/v3';
import { runResearchAgent, safeAgentError } from '@/lib/agents/executor';
import type { AgentContext } from '@/lib/memory/context-builder';
import type { AgentResult, AgentSource } from '@/lib/agents/types';

export type TriggerResearchToolName = 'screen_stocks' | 'analyze_stock' | 'brief_market';

export interface TriggerResearchPayload {
  userId: string;
  args: Record<string, unknown>;
  context: AgentContext;
  deep?: boolean;
}

export interface TriggerResearchOutput {
  success: boolean;
  content: string | null;
  sources: AgentSource[];
  model: AgentResult['model'];
  error?: string;
}

type TriggerResearchStage = 'searching' | 'analyzing' | 'generating' | 'complete' | 'error';

function normalizeExchange(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback;
}

function buildResearchSearchMessage(
  name: TriggerResearchToolName,
  payload: TriggerResearchPayload
): string {
  const exchange = normalizeExchange(payload.args.exchange, payload.context.exchangeCtx.primary);

  switch (name) {
    case 'screen_stocks': {
      const sector =
        typeof payload.args.sector === 'string' && payload.args.sector.trim()
          ? payload.args.sector.trim()
          : null;
      const strategy =
        typeof payload.args.strategy === 'string' && payload.args.strategy.trim()
          ? payload.args.strategy.trim()
          : null;
      const focus = sector ?? strategy ?? 'market';
      return `Searching for ${exchange} ${focus} stocks...`;
    }
    case 'analyze_stock': {
      const ticker =
        typeof payload.args.ticker === 'string' && payload.args.ticker.trim()
          ? payload.args.ticker.trim().toUpperCase()
          : 'the requested stock';
      return `Searching for current data on ${ticker}...`;
    }
    case 'brief_market': {
      const sector =
        typeof payload.args.sector === 'string' && payload.args.sector.trim()
          ? ` in ${payload.args.sector.trim()}`
          : '';
      return `Searching for ${exchange} market developments${sector}...`;
    }
    default:
      return 'Searching for current research...';
  }
}

function stageForElapsed(elapsedMs: number): TriggerResearchStage {
  if (elapsedMs < 20_000) return 'searching';
  if (elapsedMs < 90_000) return 'analyzing';
  return 'generating';
}

function buildStageMessage(
  stage: TriggerResearchStage,
  name: TriggerResearchToolName,
  payload: TriggerResearchPayload
): string {
  switch (stage) {
    case 'searching':
      return buildResearchSearchMessage(name, payload);
    case 'analyzing':
      return 'Analyzing results...';
    case 'generating':
      return 'Generating report...';
    case 'complete':
      return 'Report ready.';
    case 'error':
    default:
      return 'Research failed.';
  }
}

function setProgressMetadata(
  name: TriggerResearchToolName,
  payload: TriggerResearchPayload,
  stage: TriggerResearchStage,
  elapsedMs: number
): void {
  metadata.set('agentStatus', stage);
  metadata.set('agentStatusMessage', buildStageMessage(stage, name, payload));
  metadata.set('geminiElapsedMs', elapsedMs);
  metadata.set('elapsedMs', elapsedMs);
}

export async function runTriggeredResearchTask(
  name: TriggerResearchToolName,
  payload: TriggerResearchPayload,
  model: AgentResult['model']
): Promise<TriggerResearchOutput> {
  metadata.set('status', 'running');
  metadata.set('toolName', name);
  metadata.set('userId', payload.userId);

  const geminiStarted = Date.now();
  metadata.set('geminiStarted', geminiStarted);
  setProgressMetadata(name, payload, 'searching', 0);
  console.info(`[trigger:${name}] Gemini call started`, {
    startedAt: new Date(geminiStarted).toISOString(),
    startedAtMs: geminiStarted,
    model,
  });

  const progressInterval = setInterval(() => {
    const elapsedMs = Date.now() - geminiStarted;
    setProgressMetadata(name, payload, stageForElapsed(elapsedMs), elapsedMs);
  }, 5_000);

  try {
    const result = await runResearchAgent({
      name,
      args: payload.args,
      context: payload.context,
      model,
      thinkingLevel: 'medium',
      maxOutputTokens: 32768,
      // Trigger runs do not share Vercel's 60s ceiling, so give 3.1 Pro room
      // to finish and avoid multiplying retries inside task-level retries.
      requestTimeoutMs: 600000,
      maxRetries: 0,
      throwOnError: true,
    });

    const geminiCompleted = Date.now();
    const geminiElapsedMs = geminiCompleted - geminiStarted;
    metadata.set('geminiCompleted', geminiCompleted);
    setProgressMetadata(name, payload, 'complete', geminiElapsedMs);
    metadata.set('status', 'complete');
    metadata.set('sourcesCount', result.sources.length);
    console.info(`[trigger:${name}] Gemini call completed`, {
      completedAt: new Date(geminiCompleted).toISOString(),
      completedAtMs: geminiCompleted,
      elapsedMs: geminiElapsedMs,
      model,
    });

    return {
      success: true,
      content: result.content,
      sources: result.sources,
      model: result.model,
    };
  } catch (error) {
    const message = safeAgentError(error);
    const geminiCompleted = Date.now();
    const geminiElapsedMs = geminiCompleted - geminiStarted;
    metadata.set('geminiCompleted', geminiCompleted);
    metadata.set('geminiElapsedMs', geminiElapsedMs);
    metadata.set('elapsedMs', geminiElapsedMs);
    metadata.set('status', 'error');
    metadata.set('agentStatus', 'error');
    metadata.set('agentStatusMessage', message);
    metadata.set('error', message);
    console.error(`[trigger:${name}] Gemini call failed`, {
      completedAt: new Date(geminiCompleted).toISOString(),
      completedAtMs: geminiCompleted,
      elapsedMs: geminiElapsedMs,
      model,
      message,
    });
    throw error instanceof Error ? error : new Error(message);
  } finally {
    clearInterval(progressInterval);
  }
}
