import { getCachedPrice, setCachedPrice, getYahooSymbol } from './cache';
import { fetchV8QuotesParallel } from '@/lib/yahoo/v8-quote';

export interface ServerPriceResult {
  price: number;
  changePercent: number;
  currency: string;
}

export async function fetchPricesForTickers(
  tickers: Array<{ ticker: string; exchange?: string | null }>
): Promise<Record<string, ServerPriceResult>> {
  const out: Record<string, ServerPriceResult> = {};
  const toFetch: Array<{ ticker: string; exchange?: string | null }> = [];

  for (const t of tickers) {
    const key = t.ticker.toUpperCase();
    const cached = getCachedPrice(key);
    if (cached) {
      out[key] = {
        price: cached.price,
        changePercent: cached.changePercent,
        currency: cached.currency,
      };
    } else {
      toFetch.push({ ticker: key, exchange: t.exchange });
    }
  }

  if (toFetch.length === 0) return out;

  const symbolToTicker = new Map<string, string>();
  for (const t of toFetch) {
    symbolToTicker.set(getYahooSymbol(t.ticker, t.exchange), t.ticker);
  }
  const v8Map = await fetchV8QuotesParallel(Array.from(symbolToTicker.keys()));

  for (const [symbol, v8] of v8Map.entries()) {
    const ticker = symbolToTicker.get(symbol);
    if (!ticker) continue;
    setCachedPrice(ticker, {
      price: v8.regularMarketPrice,
      change: v8.dailyChange,
      changePercent: v8.dailyChangePct,
      currency: v8.currency,
      marketState: v8.marketState,
    });
    out[ticker] = {
      price: v8.regularMarketPrice,
      changePercent: v8.dailyChangePct,
      currency: v8.currency,
    };
  }

  // Tickers that failed to fetch are simply absent from `out`. Caller treats
  // missing entries as null/unavailable rather than $0.00.
  for (const t of toFetch) {
    if (!out[t.ticker]) {
      console.error(`[server-fetch] no price for ${t.ticker} (exchange=${t.exchange ?? 'n/a'})`);
    }
  }

  return out;
}
