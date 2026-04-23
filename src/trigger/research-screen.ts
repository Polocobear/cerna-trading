import { task } from '@trigger.dev/sdk/v3';
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
    return runTriggeredResearchTask('screen_stocks', payload, 'gemini-3.1-pro-preview');
  },
});
