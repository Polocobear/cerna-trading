import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { generateGateMessage } from '@/lib/agents/trade-check-executor';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { stepId, state, userReply, classification } = await req.json();
    const message = await generateGateMessage({
      stepId,
      state,
      userReply,
      classification,
    });

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('[trade-check/gate-message] failed:', error);
    return NextResponse.json({ error: 'Failed to generate gate message' }, { status: 500 });
  }
}
