import { callClaude, CLAUDE_HAIKU, CLAUDE_SONNET } from '@/lib/claude/client';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function formatResult(result: PromiseSettledResult<{
  label: string;
  model: string;
  latencyMs: number;
  text: string;
  sources: number;
  searches: number;
}>) {
  if (result.status === 'fulfilled') {
    return { status: 'pass', ...result.value };
  }

  return {
    status: 'fail',
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

async function testModel(label: string, model: typeof CLAUDE_HAIKU | typeof CLAUDE_SONNET, useSearch: boolean) {
  const startedAt = Date.now();
  const response = await callClaude({
    model,
    systemPrompt: 'You are a helpful assistant. Be very brief.',
    userMessage: useSearch
      ? 'What is the current ASX 200 index value today?'
      : 'Say "healthy" and nothing else.',
    useWebSearch: useSearch,
    webSearchMaxUses: 1,
    maxTokens: 256,
    temperature: 1,
  });

  return {
    label,
    model,
    latencyMs: Date.now() - startedAt,
    text: response.text.slice(0, 100),
    sources: response.sources.length,
    searches: response.usage.webSearchRequests,
  };
}

export async function GET() {
  const results = await Promise.allSettled([
    testModel('Haiku plain', CLAUDE_HAIKU, false),
    testModel('Sonnet plain', CLAUDE_SONNET, false),
    testModel('Sonnet + search', CLAUDE_SONNET, true),
  ]);

  return Response.json({
    status: results.every((result) => result.status === 'fulfilled') ? 'healthy' : 'degraded',
    has_key: Boolean(process.env.ANTHROPIC_API_KEY),
    tests: {
      haiku_plain: formatResult(results[0]),
      sonnet_plain: formatResult(results[1]),
      sonnet_search: formatResult(results[2]),
    },
    timestamp: new Date().toISOString(),
  });
}
