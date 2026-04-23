import { NextRequest, NextResponse } from 'next/server';
import { auth, tasks } from '@trigger.dev/sdk/v3';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import type { researchAnalyzeTask } from '@/trigger/research-analyze';

export const maxDuration = 15;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { args, context, deep } = await req.json();

    const handle = await tasks.trigger<typeof researchAnalyzeTask>(
      'research-analyze',
      {
        userId: user.id,
        args,
        context,
        deep: !!deep,
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
      agentType: 'analyze',
    });
  } catch (err) {
    console.error('[agent/analyze] failed to trigger:', err);
    return NextResponse.json({ error: 'Failed to start analysis' }, { status: 500 });
  }
}
