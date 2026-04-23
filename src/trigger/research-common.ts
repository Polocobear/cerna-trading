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

export async function runTriggeredResearchTask(
  name: TriggerResearchToolName,
  payload: TriggerResearchPayload,
  model: AgentResult['model']
): Promise<TriggerResearchOutput> {
  metadata.set('status', 'running');
  metadata.set('toolName', name);
  metadata.set('userId', payload.userId);

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
      requestTimeoutMs: 120000,
      maxRetries: 0,
      throwOnError: true,
    });

    metadata.set('status', 'complete');
    metadata.set('sourcesCount', result.sources.length);

    return {
      success: true,
      content: result.content,
      sources: result.sources,
      model: result.model,
    };
  } catch (error) {
    const message = safeAgentError(error);
    metadata.set('status', 'error');
    metadata.set('error', message);
    throw error instanceof Error ? error : new Error(message);
  }
}
