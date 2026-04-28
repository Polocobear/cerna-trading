/**
 * Portfolio sync engine — reconciles IB Flex reports with DB state.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FlexActivityReport,
  FlexTrade,
  FlexTradeConfirmReport,
  FlexTradeConfirm,
} from './flex-client';

export interface SyncResult {
  positionsUpdated: number;
  positionsAdded: number;
  positionsRemoved: number;
  cashUpdated: boolean;
  trades: number;
  errors: string[];
}

interface DbPosition {
  id: string;
  ticker: string;
  exchange: string | null;
  currency: string | null;
  shares: number;
  cost_basis: number;
  company_name: string | null;
  status: 'open' | 'closed';
}

interface LoggedTradeRow {
  id: string;
  ticker: string;
  action: 'buy' | 'sell' | 'add' | 'trim';
  shares: number;
  price: number;
  reconciled: boolean;
  created_at: string;
}

function dominantExchange(positions: Array<{ exchange: string }>): string | null {
  const counts = new Map<string, number>();
  for (const p of positions) {
    if (!p.exchange) continue;
    counts.set(p.exchange, (counts.get(p.exchange) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [ex, c] of counts.entries()) {
    if (c > bestCount) {
      best = ex;
      bestCount = c;
    }
  }
  return best;
}

function dominantCurrency(balances: Array<{ currency: string; endingCash: number }>): string | null {
  let best: string | null = null;
  let bestCash = -Infinity;
  for (const b of balances) {
    if (b.endingCash > bestCash) {
      best = b.currency;
      bestCash = b.endingCash;
    }
  }
  return best;
}

export async function syncActivityReport(
  supabase: SupabaseClient,
  userId: string,
  report: FlexActivityReport
): Promise<SyncResult> {
  const result: SyncResult = {
    positionsUpdated: 0,
    positionsAdded: 0,
    positionsRemoved: 0,
    cashUpdated: false,
    trades: 0,
    errors: [],
  };

  const { data: current, error: fetchErr } = await supabase
    .from('positions')
    .select('id, ticker, exchange, currency, shares, cost_basis, company_name, status')
    .eq('user_id', userId)
    .eq('status', 'open');

  if (fetchErr) {
    result.errors.push(`fetch positions: ${fetchErr.message}`);
    return result;
  }

  const currentByTicker = new Map<string, DbPosition>();
  for (const p of (current ?? []) as DbPosition[]) {
    currentByTicker.set(p.ticker.toUpperCase(), p);
  }

  const seenTickers = new Set<string>();

  for (const flex of report.positions) {
    const ticker = flex.symbol.toUpperCase();
    seenTickers.add(ticker);
    const shares = flex.position;
    // IB's `costBasisPrice` attribute is already per-share — use it directly.
    const costBasis = flex.costBasisPrice;
    const existing = currentByTicker.get(ticker);

    if (!existing) {
      const { error } = await supabase.from('positions').insert({
        user_id: userId,
        ticker,
        exchange: flex.exchange || 'NYSE',
        currency: flex.currency || 'USD',
        company_name: flex.description || null,
        shares,
        cost_basis: costBasis,
      });
      if (error) result.errors.push(`insert ${ticker}: ${error.message}`);
      else result.positionsAdded++;
    } else {
      const needsUpdate =
        Math.abs(existing.shares - shares) > 0.0001 ||
        Math.abs(existing.cost_basis - costBasis) > 0.0001 ||
        existing.exchange !== flex.exchange ||
        existing.currency !== flex.currency;
      if (needsUpdate) {
        const { error } = await supabase
          .from('positions')
          .update({
            shares,
            cost_basis: costBasis,
            exchange: flex.exchange || existing.exchange,
            currency: flex.currency || existing.currency,
            company_name: flex.description || existing.company_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) result.errors.push(`update ${ticker}: ${error.message}`);
        else result.positionsUpdated++;
      }
    }
  }

  // Close DB-only positions (user sold outside of our knowledge)
  for (const [ticker, pos] of currentByTicker.entries()) {
    if (!seenTickers.has(ticker)) {
      const { error } = await supabase
        .from('positions')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', pos.id);
      if (error) result.errors.push(`close ${ticker}: ${error.message}`);
      else result.positionsRemoved++;
    }
  }

  // Trades from Activity flex — insert with dedup by tradeID stored in raw_message.
  result.trades = await syncFlexTrades(supabase, userId, report.trades, result.errors);

  // Cash + currency + dominant exchange.
  // Prefer EquitySummaryByReportDateInBase (single canonical row) over CashReport rollup.
  const dominant = dominantExchange(report.positions);
  const profileUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    ib_connected: true,
  };
  if (report.equitySummary) {
    profileUpdates.cash_available = report.equitySummary.cash;
    if (report.equitySummary.currency) {
      profileUpdates.preferred_currency = report.equitySummary.currency;
    }
    result.cashUpdated = true;
  } else if (report.cashBalances.length > 0) {
    const totalCash = report.cashBalances.reduce((sum, b) => sum + b.endingCash, 0);
    const currency = dominantCurrency(report.cashBalances);
    profileUpdates.cash_available = totalCash;
    if (currency) profileUpdates.preferred_currency = currency;
    result.cashUpdated = true;
  }
  // AccountInformation.currency wins over equitySummary if present.
  if (report.accountInfo?.currency) {
    profileUpdates.preferred_currency = report.accountInfo.currency;
  }
  if (dominant) profileUpdates.preferred_exchange = dominant;

  const { error: profileErr } = await supabase
    .from('profiles')
    .update(profileUpdates)
    .eq('id', userId);
  if (profileErr) result.errors.push(`update profile: ${profileErr.message}`);

  // Log sync history
  const status = result.errors.length === 0 ? 'success' : result.errors.length < 3 ? 'partial' : 'error';
  await supabase.from('sync_history').insert({
    user_id: userId,
    sync_type: 'flex_activity',
    status,
    positions_updated: result.positionsUpdated + result.positionsAdded + result.positionsRemoved,
    trades_imported: result.trades,
    error_message: result.errors.length > 0 ? result.errors.join('; ').slice(0, 500) : null,
  });

  // Update ib_connections
  await supabase
    .from('ib_connections')
    .update({
      last_activity_sync: new Date().toISOString(),
      sync_status: status === 'error' ? 'error' : 'success',
      sync_error: status === 'error' ? result.errors.join('; ').slice(0, 500) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return result;
}

const FLEX_RAW_PREFIX = 'flex_id:';

async function syncFlexTrades(
  supabase: SupabaseClient,
  userId: string,
  trades: FlexTrade[],
  errors: string[]
): Promise<number> {
  if (trades.length === 0) return 0;

  const rawIds = trades.map((t) => `${FLEX_RAW_PREFIX}${t.tradeId}`);
  const { data: existingRows, error: fetchErr } = await supabase
    .from('logged_trades')
    .select('raw_message')
    .eq('user_id', userId)
    .in('raw_message', rawIds);

  if (fetchErr) {
    errors.push(`fetch existing trades: ${fetchErr.message}`);
    return 0;
  }

  const existing = new Set<string>();
  for (const row of (existingRows ?? []) as Array<{ raw_message: string | null }>) {
    if (row.raw_message) existing.add(row.raw_message);
  }

  let imported = 0;
  for (const t of trades) {
    const raw = `${FLEX_RAW_PREFIX}${t.tradeId}`;
    if (existing.has(raw)) continue;

    const action = t.buySell === 'SELL' ? 'sell' : 'buy';
    const { error } = await supabase.from('logged_trades').insert({
      user_id: userId,
      ticker: t.symbol.toUpperCase(),
      exchange: t.exchange || null,
      action,
      shares: t.quantity,
      price: t.price,
      currency: t.currency || null,
      logged_via: 'flex_activity',
      reconciled: true,
      raw_message: raw,
      trade_date: t.tradeDateTime,
    });
    if (error) {
      errors.push(`insert trade ${t.tradeId}: ${error.message}`);
    } else {
      imported++;
      existing.add(raw);
    }
  }
  return imported;
}

function tradesMatch(
  logged: LoggedTradeRow,
  flex: FlexTradeConfirm,
  flexDate: Date
): boolean {
  if (logged.ticker.toUpperCase() !== flex.symbol.toUpperCase()) return false;
  const loggedSide = logged.action === 'buy' || logged.action === 'add' ? 'BUY' : 'SELL';
  if (loggedSide !== flex.buySell) return false;
  // Shares within 1% or 1 share (whichever larger)
  const shareTol = Math.max(flex.quantity * 0.01, 1);
  if (Math.abs(logged.shares - flex.quantity) > shareTol) return false;
  // Price within 2%
  const priceTol = Math.max(flex.price * 0.02, 0.01);
  if (Math.abs(logged.price - flex.price) > priceTol) return false;
  // Within 24h
  const loggedDate = new Date(logged.created_at);
  const diffMs = Math.abs(loggedDate.getTime() - flexDate.getTime());
  return diffMs <= 24 * 60 * 60 * 1000;
}

function parseFlexDate(yyyymmdd: string, hhmmss: string): Date {
  if (yyyymmdd.length !== 8) return new Date();
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const mo = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  let h = 0;
  let mi = 0;
  let s = 0;
  if (hhmmss && hhmmss.length >= 6) {
    h = parseInt(hhmmss.slice(0, 2), 10);
    mi = parseInt(hhmmss.slice(2, 4), 10);
    s = parseInt(hhmmss.slice(4, 6), 10);
  }
  return new Date(Date.UTC(y, mo, d, h, mi, s));
}

export async function syncTradeConfirms(
  supabase: SupabaseClient,
  userId: string,
  report: FlexTradeConfirmReport
): Promise<SyncResult> {
  const result: SyncResult = {
    positionsUpdated: 0,
    positionsAdded: 0,
    positionsRemoved: 0,
    cashUpdated: false,
    trades: 0,
    errors: [],
  };

  // Load recent unreconciled chat-logged trades
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: loggedRaw, error: loggedErr } = await supabase
    .from('logged_trades')
    .select('id, ticker, action, shares, price, reconciled, created_at')
    .eq('user_id', userId)
    .eq('reconciled', false)
    .gte('created_at', since);

  if (loggedErr) {
    result.errors.push(`fetch logged_trades: ${loggedErr.message}`);
  }
  const logged: LoggedTradeRow[] = (loggedRaw ?? []) as LoggedTradeRow[];
  const matchedIds = new Set<string>();

  for (const flex of report.trades) {
    const flexDate = parseFlexDate(flex.tradeDate, flex.tradeTime);
    const match = logged.find((l) => !matchedIds.has(l.id) && tradesMatch(l, flex, flexDate));

    if (match) {
      matchedIds.add(match.id);
      const { error } = await supabase
        .from('logged_trades')
        .update({ reconciled: true })
        .eq('id', match.id);
      if (error) result.errors.push(`reconcile ${match.id}: ${error.message}`);
      else result.trades++;
    } else {
      // Insert as flex-sourced trade + update positions
      const action: 'buy' | 'sell' = flex.buySell === 'BUY' ? 'buy' : 'sell';
      await supabase.from('logged_trades').insert({
        user_id: userId,
        ticker: flex.symbol.toUpperCase(),
        exchange: flex.exchange || null,
        action,
        shares: flex.quantity,
        price: flex.price,
        currency: flex.currency || 'USD',
        logged_via: 'flex_trade_confirm',
        reconciled: true,
        trade_date: flexDate.toISOString(),
      });
      // Update positions (best-effort)
      const { data: existing } = await supabase
        .from('positions')
        .select('id, shares, cost_basis')
        .eq('user_id', userId)
        .eq('ticker', flex.symbol.toUpperCase())
        .eq('status', 'open')
        .maybeSingle();

      if (action === 'buy') {
        if (existing) {
          const newShares = existing.shares + flex.quantity;
          const newCost =
            (existing.shares * existing.cost_basis + flex.quantity * flex.price) / newShares;
          await supabase
            .from('positions')
            .update({ shares: newShares, cost_basis: newCost, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('positions').insert({
            user_id: userId,
            ticker: flex.symbol.toUpperCase(),
            exchange: flex.exchange || 'NYSE',
            currency: flex.currency || 'USD',
            shares: flex.quantity,
            cost_basis: flex.price,
          });
        }
      } else if (existing) {
        const newShares = existing.shares - flex.quantity;
        if (newShares <= 0.0001) {
          await supabase
            .from('positions')
            .update({
              status: 'closed',
              close_price: flex.price,
              closed_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('positions')
            .update({ shares: newShares, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
      }
      result.trades++;
    }
  }

  const status = result.errors.length === 0 ? 'success' : 'partial';
  await supabase.from('sync_history').insert({
    user_id: userId,
    sync_type: 'flex_trade_confirm',
    status,
    positions_updated: 0,
    trades_imported: result.trades,
    error_message: result.errors.length > 0 ? result.errors.join('; ').slice(0, 500) : null,
  });

  await supabase
    .from('ib_connections')
    .update({
      last_trade_sync: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  return result;
}
