import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('ib_connections')
    .select('last_activity_sync, last_trade_sync, sync_status, sync_error')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    connected: !!data,
    last_activity_sync: data?.last_activity_sync ?? null,
    last_trade_sync: data?.last_trade_sync ?? null,
    sync_status: data?.sync_status ?? null,
    sync_error: data?.sync_error ?? null,
  });
}
