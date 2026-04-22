import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { runOrchestrator } from '@/lib/agents/orchestrator';
import { buildContext } from '@/lib/memory/context-builder';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { message, sessionId } = await req.json();
    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    const context = await buildContext(supabase, user.id, sessionId);
    const result = await runOrchestrator(message, { exchangeCtx: context.exchangeCtx });

    return NextResponse.json({
      toolCalls: result.toolCalls ?? [],
      directReply: result.directReply ?? null,
      context: {
        profile: context.profile,
        positions: context.positions,
        watchlist: context.watchlist,
        exchangeCtx: context.exchangeCtx,
        portfolioContext: context.portfolioContext,
        intelligenceContext: context.intelligenceContext,
      },
    });
  } catch (err) {
    console.error('[orchestrate] failed:', err);
    return NextResponse.json({ error: 'Orchestration failed' }, { status: 500 });
  }
}
