import { NextResponse } from 'next/server';
import { GEMINI_FLASH_MODEL, GEMINI_RESEARCH_MODEL } from '@/lib/gemini/client';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

interface HealthCheckResult {
  model: string;
  status: number;
  ok: boolean;
  elapsed_ms: number;
  response?: string;
  error?: string;
  has_grounding?: boolean;
}

function withTimeout(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function runHealthCheck(
  model: string,
  prompt: string,
  grounded: boolean,
  timeoutMs: number,
  thinkingLevel: 'low' | 'medium'
): Promise<HealthCheckResult> {
  const key = process.env.GEMINI_API_KEY;
  const startedAt = Date.now();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: withTimeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(grounded ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: 1.0,
            thinkingConfig: { thinkingLevel },
            maxOutputTokens: 256,
          },
        }),
      }
    );

    const elapsed = Date.now() - startedAt;
    const body = await res.json().catch(() => ({}));
    const candidate = body?.candidates?.[0];

    return {
      model,
      status: res.status,
      ok: res.ok,
      elapsed_ms: elapsed,
      has_grounding: Boolean(candidate?.groundingMetadata || body?.groundingMetadata),
      response: res.ok
        ? candidate?.content?.parts?.map((part: { text?: string }) => part.text).filter(Boolean).join(' ').slice(0, 160)
        : undefined,
      error: res.ok ? undefined : body?.error?.message?.slice(0, 300),
    };
  } catch (err) {
    return {
      model,
      status: 500,
      ok: false,
      elapsed_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function formatSettledResult(result: PromiseSettledResult<HealthCheckResult>) {
  if (result.status === 'fulfilled') return result.value;
  return {
    model: 'unknown',
    status: 500,
    ok: false,
    elapsed_ms: 0,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  const [flashPlainResult, flashGroundedResult, proGroundedResult] = await Promise.allSettled([
    runHealthCheck(GEMINI_FLASH_MODEL, 'Say hello in one word.', false, 20000, 'low'),
    runHealthCheck(
      GEMINI_FLASH_MODEL,
      'What are the top ASX stocks today?',
      true,
      20000,
      'low'
    ),
    runHealthCheck(
      GEMINI_RESEARCH_MODEL,
      'What are the top ASX stocks today?',
      true,
      55000,
      'medium'
    ),
  ]);

  const flashPlain = formatSettledResult(flashPlainResult);
  const flashGrounded = formatSettledResult(flashGroundedResult);
  const proGrounded = formatSettledResult(proGroundedResult);
  const healthy = flashPlain.ok && flashGrounded.ok && proGrounded.ok;

  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    has_key: Boolean(key),
    tests: {
      flash_plain: flashPlain,
      flash_grounded: flashGrounded,
      pro_grounded: proGrounded,
    },
    note: 'Flash runs on Vercel. Pro grounded is intended for Trigger.dev research tasks and may be slower.',
    timestamp: new Date().toISOString(),
  });
}
