import { NextResponse } from 'next/server';
import {
  getCachedPrice,
  setCachedPrice,
  getYahooSymbol,
  stripYahooSuffix,
  type PriceData,
} from '@/lib/prices/cache';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
}

interface YahooResponse {
  quoteResponse?: {
    result?: YahooQuote[];
    error?: unknown;
  };
}

async function fetchYahoo(
  entries: Array<{ ticker: string; exchange?: string | null }>
): Promise<Record<string, Omit<PriceData, 'fetchedAt'>>> {
  const symbolToTicker = new Map<string, string>();
  for (const e of entries) {
    const sym = getYahooSymbol(e.ticker, e.exchange);
    symbolToTicker.set(sym, e.ticker.toUpperCase());
  }
  const symbols = Array.from(symbolToTicker.keys()).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = (await res.json()) as YahooResponse;
  const results = data.quoteResponse?.result ?? [];

  const out: Record<string, Omit<PriceData, 'fetchedAt'>> = {};
  for (const q of results) {
    if (q.regularMarketPrice == null) continue;
    const ticker = symbolToTicker.get(q.symbol) ?? stripYahooSuffix(q.symbol).toUpperCase();
    out[ticker] = {
      price: q.regularMarketPrice,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      currency: q.currency ?? 'USD',
      marketState: q.marketState ?? 'CLOSED',
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
