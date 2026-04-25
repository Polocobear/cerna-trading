import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { classifyUserResponse } from '@/lib/agents/trade-check-executor';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { userMessage } = await req.json();
    if (typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return NextResponse.json({ error: 'Missing userMessage' }, { status: 400 });
    }

    const classification = await classifyUserResponse(userMessage);
    return NextResponse.json({ success: true, classification });
  } catch (error) {
    console.error('[trade-check/classify] failed:', error);
    return NextResponse.json({ error: 'Failed to classify reply' }, { status: 500 });
  }
}
