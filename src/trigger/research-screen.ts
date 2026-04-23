import { task } from '@trigger.dev/sdk/v3';
import { CLAUDE_SONNET } from '@/lib/claude/client';
import {
  runTriggeredResearchTask,
  type TriggerResearchPayload,
} from '@/trigger/research-common';

export const researchScreenTask = task({
  id: 'research-screen',
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: TriggerResearchPayload) => {
    return runTriggeredResearchTask('screen_stocks', payload, CLAUDE_SONNET);
  },
});
