import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateAlerts } from '@/lib/alerts/alert-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const count = await generateAlerts(user.id);
    return NextResponse.json({ generated: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
