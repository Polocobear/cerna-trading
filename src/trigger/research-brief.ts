import { task } from '@trigger.dev/sdk/v3';
import {
  runTriggeredResearchTask,
  type TriggerResearchPayload,
} from '@/trigger/research-common';

export const researchBriefTask = task({
  id: 'research-brief',
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: TriggerResearchPayload) => {
    return runTriggeredResearchTask('brief_market', payload, 'gemini-3.1-pro-preview');
  },
});
