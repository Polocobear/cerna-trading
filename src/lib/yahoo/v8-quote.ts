/**
 * Shared Yahoo Finance v8 chart-endpoint client.
 *
 * Yahoo's v7 quote endpoint started returning HTTP 401 in 2025 and v10
 * quoteSummary requires a crumb cookie that's painful to obtain. The v8
 * chart endpoint still works without auth and returns the same prices.
 *
 * It's a per-symbol endpoint — callers fan out via Promise.allSettled.
 */

const V8_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

const DEFAULT_TIMEOUT_MS = 5000;

export interface V8QuoteResult {
  symbol: string;
  currency: string;
  exchangeName: string;
  regularMarketPrice: number;
  previousClose: number;
  dailyChange: number;
  dailyChangePct: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  marketState: 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';
}

interface V8ChartMeta {
  symbol?: string;
  currency?: string;
  exchangeName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketTime?: number;
  gmtoffset?: number;
}

interface V8ChartResponse {
  chart?: {
    result?: Array<{ meta?: V8ChartMeta }>;
    error?: { description?: string } | null;
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Heuristic market-state from regular-market timestamp.
 *
 * The chart endpoint doesn't report marketState directly, but we can
 * approximate REGULAR when regularMarketTime is within the last 30 minutes.
 */
function inferMarketState(meta: V8ChartMeta): V8QuoteResult['marketState'] {
  if (typeof meta.regularMarketTime !== 'number') return 'CLOSED';
  const ageMs = Date.now() - meta.regularMarketTime * 1000;
  if (ageMs >= 0 && ageMs < 30 * 60 * 1000) return 'REGULAR';
  return 'CLOSED';
}

export async function fetchV8Quote(
  symbol: string,
  options: { timeoutMs?: number } = {}
): Promise<V8QuoteResult | null> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const url = `${V8_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[yahoo-v8] ${symbol} HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as V8ChartResponse;
    if (data.chart?.error) {
      console.error(`[yahoo-v8] ${symbol} api error:`, data.chart.error.description);
      return null;
    }
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') {
      console.error(`[yahoo-v8] ${symbol} missing regularMarketPrice in response`);
      return null;
    }

    const price = num(meta.regularMarketPrice);
    const prevClose = num(meta.chartPreviousClose ?? meta.previousClose);
    const dailyChange = price - prevClose;
    const dailyChangePct = prevClose > 0 ? (dailyChange / prevClose) * 100 : 0;

    return {
      symbol: meta.symbol ?? symbol,
      currency: meta.currency ?? 'USD',
      exchangeName: meta.exchangeName ?? '',
      regularMarketPrice: price,
      previousClose: prevClose,
      dailyChange,
      dailyChangePct,
      regularMarketDayHigh: num(meta.regularMarketDayHigh) || price,
      regularMarketDayLow: num(meta.regularMarketDayLow) || price,
      fiftyTwoWeekHigh: num(meta.fiftyTwoWeekHigh) || price,
      fiftyTwoWeekLow: num(meta.fiftyTwoWeekLow) || price,
      marketState: inferMarketState(meta),
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.error(`[yahoo-v8] ${symbol} timeout after ${timeoutMs}ms`);
    } else {
      console.error(`[yahoo-v8] ${symbol} fetch failed:`, err instanceof Error ? err.message : err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fan out v8 quote fetches in parallel.
 * Returns a map keyed by the SYMBOL passed in (caller's responsibility to
 * pre-apply suffixes like .AX). Missing symbols are simply absent from the map.
 */
export async function fetchV8QuotesParallel(
  symbols: string[],
  options: { timeoutMs?: number } = {}
): Promise<Map<string, V8QuoteResult>> {
  const out = new Map<string, V8QuoteResult>();
  const settled = await Promise.allSettled(symbols.map((s) => fetchV8Quote(s, options)));
  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled' && result.value) {
      out.set(symbols[idx], result.value);
    }
  });
  return out;
}
