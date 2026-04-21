import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchActivityReport, fetchTradeConfirmReport } from '@/lib/ib/flex-client';
import { syncActivityReport, syncTradeConfirms } from '@/lib/ib/sync-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface IbConnectionRow {
  flex_token: string;
  activity_query_id: string;
  trade_confirm_query_id: string | null;
}

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: conn, error: connErr } = await supabase
    .from('ib_connections')
    .select('flex_token, activity_query_id, trade_confirm_query_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });
  if (!conn) {
    return NextResponse.json(
      { error: 'No IB connection configured. Set up Flex Query credentials first.' },
      { status: 400 }
    );
  }

  const c = conn as IbConnectionRow;

  await supabase
    .from('ib_connections')
    .update({ sync_status: 'syncing', sync_error: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);

  try {
    const activity = await fetchActivityReport(c.flex_token, c.activity_query_id);
    const activityResult = await syncActivityReport(supabase, user.id, activity);

    let tradeResult = null;
    if (c.trade_confirm_query_id) {
      try {
        const confirms = await fetchTradeConfirmReport(c.flex_token, c.trade_confirm_query_id);
        tradeResult = await syncTradeConfirms(supabase, user.id, confirms);
      } catch (err) {
        // Non-fatal
        const msg = err instanceof Error ? err.message : 'trade confirm sync failed';
        activityResult.errors.push(`trade_confirm: ${msg}`);
      }
    }

    return NextResponse.json({
      ok: true,
      activity: activityResult,
      trades: tradeResult,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'sync failed';
    await supabase
      .from('ib_connections')
      .update({
        sync_status: 'error',
        sync_error: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);
    await supabase.from('sync_history').insert({
      user_id: user.id,
      sync_type: 'flex_activity',
      status: 'error',
      positions_updated: 0,
      trades_imported: 0,
      error_message: msg.slice(0, 500),
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
