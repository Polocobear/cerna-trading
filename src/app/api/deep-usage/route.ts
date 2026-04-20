import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDeepUsageRemaining, getDeepLimit } from '@/lib/gemini/deep-usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    remaining: getDeepUsageRemaining(user.id),
    limit: getDeepLimit(),
  });
}
