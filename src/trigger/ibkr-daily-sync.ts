import { schedules } from '@trigger.dev/sdk/v3';
import { createServiceClient } from '@/lib/supabase/service';
import { fetchActivityReport, fetchTradeConfirmReport } from '@/lib/ib/flex-client';
import { syncActivityReport, syncTradeConfirms } from '@/lib/ib/sync-engine';

interface IbConnection {
  user_id: string;
  flex_token: string;
  activity_query_id: string;
  trade_confirm_query_id: string | null;
}

interface UserSyncOutcome {
  userId: string;
  ok: boolean;
  positionsAdded?: number;
  positionsUpdated?: number;
  positionsRemoved?: number;
  trades?: number;
  errors?: string[];
  failure?: string;
}

interface DailySyncSummary {
  total: number;
  succeeded: number;
  failed: number;
  outcomes: UserSyncOutcome[];
}

/**
 * Daily IBKR auto-sync — runs at 21:00 UTC (07:00 AEST) to align with
 * ASX EOD plus IBKR Flex statement generation lag.
 *
 * Iterates through all users with saved Flex credentials, fetches their
 * Activity report (and optional Trade Confirmation report), and writes
 * positions / cash / trades into Supabase. Staggers requests to avoid
 * hammering IBKR's rate limit.
 */
export const ibkrDailySync = schedules.task({
  id: 'ibkr-daily-sync',
  cron: '0 21 * * *',
  maxDuration: 1800,
  run: async (): Promise<DailySyncSummary> => {
    const supabase = createServiceClient();

    const { data: connectionsRaw, error } = await supabase
      .from('ib_connections')
      .select('user_id, flex_token, activity_query_id, trade_confirm_query_id')
      .not('flex_token', 'is', null)
      .not('activity_query_id', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch ib_connections: ${error.message}`);
    }

    const connections = (connectionsRaw ?? []) as IbConnection[];
    const summary: DailySyncSummary = {
      total: connections.length,
      succeeded: 0,
      failed: 0,
      outcomes: [],
    };

    for (let i = 0; i < connections.length; i++) {
      const conn = connections[i];
      try {
        await supabase
          .from('ib_connections')
          .update({
            sync_status: 'syncing',
            sync_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', conn.user_id);

        const activity = await fetchActivityReport(conn.flex_token, conn.activity_query_id);
        const activityResult = await syncActivityReport(supabase, conn.user_id, activity);

        let tradesSynced = activityResult.trades;
        if (conn.trade_confirm_query_id) {
          try {
            const confirms = await fetchTradeConfirmReport(
              conn.flex_token,
              conn.trade_confirm_query_id
            );
            const tradeResult = await syncTradeConfirms(supabase, conn.user_id, confirms);
            tradesSynced += tradeResult.trades;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'trade confirm sync failed';
            activityResult.errors.push(`trade_confirm: ${msg}`);
          }
        }

        summary.succeeded++;
        summary.outcomes.push({
          userId: conn.user_id,
          ok: true,
          positionsAdded: activityResult.positionsAdded,
          positionsUpdated: activityResult.positionsUpdated,
          positionsRemoved: activityResult.positionsRemoved,
          trades: tradesSynced,
          errors: activityResult.errors.length > 0 ? activityResult.errors : undefined,
        });
        console.info(`[ibkr-daily-sync] ${conn.user_id} ok`, {
          positionsAdded: activityResult.positionsAdded,
          positionsUpdated: activityResult.positionsUpdated,
          positionsRemoved: activityResult.positionsRemoved,
          trades: tradesSynced,
          errorCount: activityResult.errors.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        summary.failed++;
        summary.outcomes.push({ userId: conn.user_id, ok: false, failure: msg });
        await supabase
          .from('ib_connections')
          .update({
            sync_status: 'error',
            sync_error: msg.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', conn.user_id);
        await supabase.from('sync_history').insert({
          user_id: conn.user_id,
          sync_type: 'flex_activity',
          status: 'error',
          positions_updated: 0,
          trades_imported: 0,
          error_message: msg.slice(0, 500),
        });
        console.error(`[ibkr-daily-sync] ${conn.user_id} failed:`, msg);
      }

      // Stagger requests so IBKR doesn't rate-limit us when many users sync.
      if (i < connections.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.info('[ibkr-daily-sync] complete', {
      total: summary.total,
      succeeded: summary.succeeded,
      failed: summary.failed,
    });
    return summary;
  },
});
