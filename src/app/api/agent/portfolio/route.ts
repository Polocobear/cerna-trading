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

    const result = await runAgent({
      name: 'check_portfolio',
      args,
      context,
      deep: !!deep,
      deadlineMs: Date.now() + 50000,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[agent/portfolio] failed:', err);
    return NextResponse.json({ 
      success: false, 
      content: null, 
      error: 'Portfolio agent failed',
      sources: [],
    }, { status: 200 }); 
  }
}
