import { task } from '@trigger.dev/sdk/v3';
import {
  runTriggeredResearchTask,
  type TriggerResearchPayload,
} from '@/trigger/research-common';

export const researchAnalyzeTask = task({
  id: 'research-analyze',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: TriggerResearchPayload) => {
    return runTriggeredResearchTask('analyze_stock', payload, 'gemini-3.1-pro-preview');
  },
});
