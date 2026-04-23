import { NextResponse } from 'next/server';
import { GEMINI_MODEL } from '@/lib/gemini/client';

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
  prompt: string,
  grounded: boolean
): Promise<HealthCheckResult> {
  const key = process.env.GEMINI_API_KEY;
  const startedAt = Date.now();

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: withTimeout(20000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(grounded ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: 1.0,
            thinkingConfig: { thinkingLevel: 'low' },
            maxOutputTokens: 256,
          },
        }),
      }
    );

    const elapsed = Date.now() - startedAt;
    const body = await res.json().catch(() => ({}));
    const candidate = body?.candidates?.[0];

    return {
      model: GEMINI_MODEL,
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
      model: GEMINI_MODEL,
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
    model: GEMINI_MODEL,
    status: 500,
    ok: false,
    elapsed_ms: 0,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  };
}

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  const [flashPlainResult, flashGroundedResult] = await Promise.allSettled([
    runHealthCheck('Say hello in one word.', false),
    runHealthCheck('What are the top ASX stocks today?', true),
  ]);

  const flashPlain = formatSettledResult(flashPlainResult);
  const flashGrounded = formatSettledResult(flashGroundedResult);
  const healthy = flashPlain.ok && flashGrounded.ok;

  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    model: GEMINI_MODEL,
    has_key: Boolean(key),
    tests: {
      flash_plain: flashPlain,
      flash_grounded: flashGrounded,
    },
    timestamp: new Date().toISOString(),
  });
}
