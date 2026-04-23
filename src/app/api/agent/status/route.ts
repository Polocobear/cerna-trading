import { NextRequest, NextResponse } from 'next/server';
import { runs } from '@trigger.dev/sdk/v3';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

interface TriggerRunShape {
  payload?: {
    userId?: string;
  };
  metadata?: Record<string, unknown>;
  output?: unknown;
  status: string;
  finishedAt?: Date | string | null;
  error?: {
    message?: string;
  };
  attempts?: Array<{
    error?: {
      message?: string;
    };
  }>;
}

function extractRunErrorMessage(run: TriggerRunShape): string | null {
  if (run.error?.message) return run.error.message;

  const attempts = Array.isArray(run.attempts) ? [...run.attempts].reverse() : [];
  for (const attempt of attempts) {
    if (attempt.error?.message) return attempt.error.message;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const runId = req.nextUrl.searchParams.get('runId');
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 });
  }

  try {
    const run = (await runs.retrieve(runId)) as TriggerRunShape;
    const payloadUserId = run.payload?.userId;
    const metadataUserId =
      typeof run.metadata?.userId === 'string' ? run.metadata.userId : undefined;

    if (!payloadUserId && !metadataUserId) {
      return NextResponse.json({ error: 'Run ownership unavailable' }, { status: 403 });
    }

    if (payloadUserId !== user.id && metadataUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      status: run.status,
      output: run.output ?? null,
      error: extractRunErrorMessage(run),
      metadata: run.metadata ?? {},
      finishedAt: run.finishedAt ?? null,
    });
  } catch (error) {
    console.error('[agent/status] failed:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
