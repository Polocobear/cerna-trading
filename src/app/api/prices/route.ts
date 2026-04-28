import { NextResponse } from 'next/server';
import {
  getCachedPrice,
  setCachedPrice,
  getYahooSymbol,
  type PriceData,
} from '@/lib/prices/cache';
import { fetchV8QuotesParallel } from '@/lib/yahoo/v8-quote';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchYahoo(
  entries: Array<{ ticker: string; exchange?: string | null }>
): Promise<Record<string, Omit<PriceData, 'fetchedAt'>>> {
  const symbolToTicker = new Map<string, string>();
  for (const e of entries) {
    const sym = getYahooSymbol(e.ticker, e.exchange);
    symbolToTicker.set(sym, e.ticker.toUpperCase());
  }
  const symbols = Array.from(symbolToTicker.keys());
  const v8Map = await fetchV8QuotesParallel(symbols);

  const out: Record<string, Omit<PriceData, 'fetchedAt'>> = {};
  for (const [symbol, v8] of v8Map.entries()) {
    const ticker = symbolToTicker.get(symbol);
    if (!ticker) continue;
    out[ticker] = {
      price: v8.regularMarketPrice,
      change: v8.dailyChange,
      changePercent: v8.dailyChangePct,
      currency: v8.currency,
      marketState: v8.marketState,
    };
  }
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tickersParam = searchParams.get('tickers') ?? '';
  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ prices: {}, errors: [], cached: false });
  }

  // Lookup exchange mapping for the caller's positions + watchlist (best-effort).
  const exchangeByTicker = new Map<string, string>();
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [positions, watchlist] = await Promise.all([
        supabase
          .from('positions')
          .select('ticker, exchange')
          .eq('user_id', user.id)
          .in('ticker', tickers),
        supabase
          .from('watchlist')
          .select('ticker, exchange')
          .eq('user_id', user.id)
          .in('ticker', tickers),
      ]);
      for (const row of positions.data ?? []) {
        if (row.ticker && row.exchange) exchangeByTicker.set(row.ticker.toUpperCase(), row.exchange);
      }
      for (const row of watchlist.data ?? []) {
        if (row.ticker && row.exchange && !exchangeByTicker.has(row.ticker.toUpperCase())) {
          exchangeByTicker.set(row.ticker.toUpperCase(), row.exchange);
        }
      }
    }
  } catch {
    // non-fatal; fall back to default (ASX) suffix
  }

  const prices: Record<string, Omit<PriceData, 'fetchedAt'>> = {};
  const errors: string[] = [];
  const toFetch: Array<{ ticker: string; exchange?: string | null }> = [];
  let allCached = true;

  for (const t of tickers) {
    const cached = getCachedPrice(t);
    if (cached) {
      const { fetchedAt: _fetchedAt, ...rest } = cached;
      void _fetchedAt;
      prices[t] = rest;
    } else {
      toFetch.push({ ticker: t, exchange: exchangeByTicker.get(t) });
      allCached = false;
    }
  }

  if (toFetch.length > 0) {
    try {
      const fresh = await fetchYahoo(toFetch);
      for (const [ticker, data] of Object.entries(fresh)) {
        setCachedPrice(ticker, data);
        prices[ticker] = data;
      }
      for (const t of toFetch) {
        if (!fresh[t.ticker]) errors.push(t.ticker);
      }
    } catch (err) {
      for (const t of toFetch) errors.push(t.ticker);
      return NextResponse.json({
        prices,
        errors,
        cached: false,
        error: err instanceof Error ? err.message : 'price fetch failed',
      });
    }
  }

  return NextResponse.json({ prices, errors, cached: allCached });
}
