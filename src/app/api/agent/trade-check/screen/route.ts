import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { executeScreenStep } from '@/lib/agents/trade-check-executor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { ticker, requestedAction, context, extraContext } = await req.json();
    const result = await executeScreenStep({
      ticker,
      requestedAction,
      context,
      extraContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[trade-check/screen] failed:', error);
    return NextResponse.json(
      { success: false, result: null, error: 'Trade check screen failed', sources: [] },
      { status: 200 }
    );
  }
}
