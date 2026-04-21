import { getCachedPrice, setCachedPrice } from './cache';

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  currency?: string;
}

interface YahooResponse {
  quoteResponse?: { result?: YahooQuote[] };
}

export interface ServerPriceResult {
  price: number;
  changePercent: number;
  currency: string;
}

export async function fetchPricesForTickers(
  tickers: Array<{ ticker: string; exchange?: string | null }>
): Promise<Record<string, ServerPriceResult>> {
  const out: Record<string, ServerPriceResult> = {};
  const toFetch: string[] = [];

  for (const { ticker } of tickers) {
    const key = ticker.toUpperCase();
    const cached = getCachedPrice(key);
    if (cached) {
      out[key] = { price: cached.price, changePercent: cached.changePercent, currency: cached.currency };
    } else {
      toFetch.push(key);
    }
  }

  if (toFetch.length === 0) return out;

  // Use .AX suffix (ASX-focused app)
  const symbols = toFetch.map((t) => `${t}.AX`).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!res.ok) return out;

    const data = (await res.json()) as YahooResponse;
    const results = data.quoteResponse?.result ?? [];

    for (const q of results) {
      if (q.regularMarketPrice == null) continue;
      const ticker = q.symbol.replace(/\.AX$/i, '').toUpperCase();
      setCachedPrice(ticker, {
        price: q.regularMarketPrice,
        change: 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        currency: q.currency ?? 'AUD',
        marketState: 'CLOSED',
      });
      out[ticker] = {
        price: q.regularMarketPrice,
        changePercent: q.regularMarketChangePercent ?? 0,
        currency: q.currency ?? 'AUD',
      };
    }
  } catch {
    // Non-fatal
  }

  return out;
}
