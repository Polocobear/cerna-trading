import { NextResponse } from 'next/server';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.GEMINI_API_KEY;
  const elapsedMs = (value: unknown): number => (typeof value === 'number' ? value : 0);
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    has_key: !!key,
    key_length: key?.length ?? 0,
    key_prefix: key?.slice(0, 6) ?? 'MISSING',
  };

  // Test 1: Gemini Flash without search grounding
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hello in one word' }] }],
        }),
      }
    );
    const elapsed = Date.now() - start;
    const body = await res.json();
    results.flash_plain = {
      status: res.status,
      elapsed_ms: elapsed,
      ok: res.ok,
      response: res.ok
        ? body?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100)
        : body?.error?.message?.slice(0, 200),
    };
  } catch (err: unknown) {
    results.flash_plain = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 2: Gemini Flash WITH search grounding (this is what the agents use)
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'What are the top ASX stocks today?' }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );
    const elapsed = Date.now() - start;
    const body = await res.json();
    results.flash_grounded = {
      status: res.status,
      elapsed_ms: elapsed,
      ok: res.ok,
      has_grounding: !!body?.candidates?.[0]?.groundingMetadata,
      response: res.ok
        ? body?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100)
        : body?.error?.message?.slice(0, 300),
    };
  } catch (err: unknown) {
    results.flash_grounded = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 3: Gemini Pro WITH search grounding (this is what deep research agents use)
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'What are the top ASX stocks today?' }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );
    const elapsed = Date.now() - start;
    const body = await res.json();
    results.pro_grounded = {
      status: res.status,
      elapsed_ms: elapsed,
      ok: res.ok,
      has_grounding: !!body?.candidates?.[0]?.groundingMetadata,
      response: res.ok
        ? body?.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 100)
        : body?.error?.message?.slice(0, 300),
    };
  } catch (err: unknown) {
    results.pro_grounded = { error: err instanceof Error ? err.message : String(err) };
  }

  // Test 4: Check total time budget
  results.total_elapsed_ms =
    elapsedMs((results.flash_plain as Record<string, unknown>)?.elapsed_ms) +
    elapsedMs((results.flash_grounded as Record<string, unknown>)?.elapsed_ms) +
    elapsedMs((results.pro_grounded as Record<string, unknown>)?.elapsed_ms);

  return NextResponse.json(results, { status: 200 });
}
