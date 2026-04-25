import { NextRequest, NextResponse } from 'next/server';
import { auth, tasks } from '@trigger.dev/sdk/v3';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import type { tradeCheckFundamentalsTask } from '@/trigger/trade-check-fundamentals';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { ticker, requestedAction, context, extraContext } = await req.json();

    const handle = await tasks.trigger<typeof tradeCheckFundamentalsTask>(
      'trade-check-fundamentals',
      {
        userId: user.id,
        ticker,
        requestedAction,
        context,
        extraContext,
      },
      {
        ttl: '1h',
      }
    );

    const publicAccessToken = await auth.createPublicToken({
      scopes: {
        read: {
          runs: [handle.id],
        },
      },
      expirationTime: '2h',
    });

    return NextResponse.json({
      runId: handle.id,
      publicAccessToken,
      stepId: 'fundamentals',
    });
  } catch (error) {
    console.error('[trade-check/fundamentals] failed:', error);
    return NextResponse.json({ error: 'Failed to start fundamentals step' }, { status: 500 });
  }
}
