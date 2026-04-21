import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testFlexConnection, fetchActivityReport } from '@/lib/ib/flex-client';
import { syncActivityReport } from '@/lib/ib/sync-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SaveConnectionBody {
  flex_token: string;
  activity_query_id: string;
  trade_confirm_query_id?: string;
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('ib_connections')
    .select(
      'activity_query_id, trade_confirm_query_id, last_activity_sync, last_trade_sync, sync_status, sync_error'
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    connected: !!data,
    activity_query_id: data?.activity_query_id ?? null,
    trade_confirm_query_id: data?.trade_confirm_query_id ?? null,
    last_activity_sync: data?.last_activity_sync ?? null,
    last_trade_sync: data?.last_trade_sync ?? null,
    sync_status: data?.sync_status ?? null,
    sync_error: data?.sync_error ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: SaveConnectionBody;
  try {
    body = (await req.json()) as SaveConnectionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { flex_token, activity_query_id, trade_confirm_query_id } = body;
  if (!flex_token || !activity_query_id) {
    return NextResponse.json(
      { error: 'flex_token and activity_query_id are required' },
      { status: 400 }
    );
  }

  // Validate via test fetch before saving
  const test = await testFlexConnection(flex_token, activity_query_id);
  if (!test.ok) {
    return NextResponse.json({ error: test.error }, { status: 400 });
  }

  // Upsert connection
  const { error: upsertErr } = await supabase.from('ib_connections').upsert(
    {
      user_id: user.id,
      flex_token,
      activity_query_id,
      trade_confirm_query_id: trade_confirm_query_id || null,
      sync_status: 'pending',
      sync_error: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  // Trigger initial sync
  try {
    const report = await fetchActivityReport(flex_token, activity_query_id);
    const result = await syncActivityReport(supabase, user.id, report);
    return NextResponse.json({
      ok: true,
      test: { positions: test.positions, cashCurrencies: test.cashCurrencies },
      sync: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'initial sync failed';
    return NextResponse.json({ ok: true, sync_error: msg, test }, { status: 200 });
  }
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('ib_connections').delete().eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('profiles').update({ ib_connected: false }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}
