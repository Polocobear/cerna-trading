import { NextResponse } from 'next/server';
import { ibkrDailySync } from '@/trigger/ibkr-daily-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manually invoke the ibkr-daily-sync schedule (also exposed for testing
 * + emergency reruns). Requires `x-cron-secret` header.
 */
export async function POST(request: Request) {
  const provided = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const handle = await ibkrDailySync.trigger({
      type: 'IMPERATIVE',
      timestamp: new Date(),
      timezone: 'UTC',
      scheduleId: 'manual',
      upcoming: [],
    });
    return NextResponse.json({ runId: handle.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to trigger sync';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
