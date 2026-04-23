import { task } from '@trigger.dev/sdk/v3';
import { CLAUDE_SONNET } from '@/lib/claude/client';
import {
  runTriggeredResearchTask,
  type TriggerResearchPayload,
} from '@/trigger/research-common';

export const researchAnalyzeTask = task({
  id: 'research-analyze',
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: TriggerResearchPayload) => {
    return runTriggeredResearchTask('analyze_stock', payload, CLAUDE_SONNET);
  },
});
