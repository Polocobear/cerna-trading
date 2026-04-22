import { NextResponse } from 'next/server';
import { GEMINI_FLASH, GEMINI_PRO } from '@/lib/gemini/client';

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

  // Test 1: Gemini 3 Flash without search grounding
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hello in one word' }] }],
          generationConfig: {
            temperature: 1.0,
            thinkingConfig: { thinkingLevel: 'low' },
          },
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

  // Test 2: Gemini 3 Flash WITH search grounding
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'What are the top ASX stocks today?' }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 1.0,
            thinkingConfig: { thinkingLevel: 'low' },
          },
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

  // Test 3: Gemini 3.1 Pro WITH search grounding
  try {
    const start = Date.now();
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_PRO}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'What are the top ASX stocks today?' }] }],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 1.0,
            thinkingConfig: { thinkingLevel: 'medium' },
          },
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
