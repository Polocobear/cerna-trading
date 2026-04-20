import type { SonarMessage } from '@/types/sonar';

const SONAR_URL = 'https://api.perplexity.ai/chat/completions';

export async function callSonarStream(messages: SonarMessage[]): Promise<Response> {
  const apiKey = process.env.SONAR_API_KEY;
  if (!apiKey) {
    throw new Error('SONAR_API_KEY is not configured');
  }

  return fetch(SONAR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      stream: true,
      messages,
    }),
  });
}
