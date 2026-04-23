import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { runAgent } from '@/lib/agents/executor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { args, context, deep } = await req.json();

    const deadlineMs = Date.now() + 45000;
    const result = await runAgent({
      name: 'brief_market',
      args,
      context,
      deep: !!deep,
      deadlineMs,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[agent/brief] failed:', err);
    return NextResponse.json({ 
      success: false, 
      content: null, 
      error: 'Brief agent failed',
      sources: [],
    }, { status: 200 }); 
  }
}
