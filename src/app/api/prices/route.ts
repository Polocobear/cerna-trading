import { NextResponse } from 'next/server';
import { getCachedPrice, setCachedPrice, type PriceData } from '@/lib/prices/cache';

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

async function fetchYahoo(tickers: string[]): Promise<Record<string, Omit<PriceData, 'fetchedAt'>>> {
  const symbols = tickers.map((t) => `${t}.AX`).join(',');
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
    const ticker = q.symbol.replace(/\.AX$/, '');
    if (q.regularMarketPrice == null) continue;
    out[ticker] = {
      price: q.regularMarketPrice,
      change: q.regularMarketChange ?? 0,
      changePercent: q.regularMarketChangePercent ?? 0,
      currency: q.currency ?? 'AUD',
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

  const prices: Record<string, Omit<PriceData, 'fetchedAt'>> = {};
  const errors: string[] = [];
  const toFetch: string[] = [];
  let allCached = true;

  for (const t of tickers) {
    const cached = getCachedPrice(t);
    if (cached) {
      const { fetchedAt: _fetchedAt, ...rest } = cached;
      void _fetchedAt;
      prices[t] = rest;
    } else {
      toFetch.push(t);
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
        if (!fresh[t]) errors.push(t);
      }
    } catch (err) {
      for (const t of toFetch) errors.push(t);
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
