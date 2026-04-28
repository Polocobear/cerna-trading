import type {
  YahooAnalyst,
  YahooEarnings,
  YahooHistorical,
  YahooHistoricalPrice,
  YahooMarketState,
  YahooNewsItem,
  YahooQuote,
} from './types';
import { fetchV8QuotesParallel } from './v8-quote';

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

const QUOTE_BATCH_SIZE = 20;

type YahooNumberField = {
  raw?: number | null;
  fmt?: string | null;
};

type YahooDateField = {
  raw?: number | null;
  fmt?: string | null;
};

type YahooNumberish = YahooNumberField | number | null | undefined;

interface RecommendationTrendEntry {
  period?: string;
  strongBuy?: number;
  buy?: number;
  hold?: number;
  sell?: number;
  strongSell?: number;
}

interface QuoteSummaryResult {
  recommendationTrend?: {
    trend?: RecommendationTrendEntry[];
  };
  financialData?: {
    targetMeanPrice?: YahooNumberField | null;
    targetHighPrice?: YahooNumberField | null;
    targetLowPrice?: YahooNumberField | null;
    currentPrice?: YahooNumberField | null;
    recommendationMean?: YahooNumberField | null;
  };
  calendarEvents?: {
    earnings?: {
      earningsDate?: YahooDateField[];
    };
  };
}

interface QuoteSummaryResponse {
  quoteSummary?: {
    result?: QuoteSummaryResult[];
  };
}

interface SearchNewsResult {
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
}

interface SearchEndpointResponse {
  news?: SearchNewsResult[];
}

interface HistoricalQuoteSeries {
  open?: Array<number | null>;
  high?: Array<number | null>;
  low?: Array<number | null>;
  close?: Array<number | null>;
  volume?: Array<number | null>;
}

interface ChartResult {
  timestamp?: number[];
  indicators?: {
    quote?: HistoricalQuoteSeries[];
  };
}

interface ChartEndpointResponse {
  chart?: {
    result?: ChartResult[];
  };
}

function normalizeTicker(ticker: string): string {
  return ticker.trim().toUpperCase();
}

function getExchangeSuffix(exchange?: string | null): string {
  switch ((exchange ?? 'ASX').trim().toUpperCase()) {
    case 'ASX':
      return '.AX';
    case 'TSX':
      return '.TO';
    case 'TSXV':
      return '.V';
    case 'LSE':
      return '.L';
    case 'HKEX':
    case 'HK':
      return '.HK';
    case 'NSE':
      return '.NS';
    case 'BSE':
      return '.BO';
    case 'SSE':
      return '.SS';
    case 'SZSE':
      return '.SZ';
    case 'NASDAQ':
    case 'NYSE':
    case 'AMEX':
    case 'US':
    default:
      return '';
  }
}

export function getYahooSymbol(ticker: string, exchange?: string | null): string {
  return `${normalizeTicker(ticker)}${getExchangeSuffix(exchange)}`;
}

function normalizeMarketState(value?: string): YahooMarketState {
  const state = (value ?? '').toUpperCase();
  if (state.startsWith('PRE')) return 'PRE';
  if (state.startsWith('POST')) return 'POST';
  if (state.startsWith('REGULAR')) return 'REGULAR';
  return 'CLOSED';
}

function toNumber(value: YahooNumberish): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && typeof value.raw === 'number' && Number.isFinite(value.raw)) {
    return value.raw;
  }
  return null;
}

function toIsoDateFromUnix(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString();
}

function toDayStartUtc(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function calculateDaysUntil(isoDate: string): number {
  const today = toDayStartUtc(new Date());
  const target = toDayStartUtc(new Date(isoDate));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

async function fetchYahooJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: YAHOO_HEADERS,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function fetchQuotes(tickers: string[], exchange?: string): Promise<YahooQuote[]> {
  const uniqueTickers = Array.from(new Set(tickers.map(normalizeTicker))).filter(Boolean);
  if (uniqueTickers.length === 0) return [];

  const results: YahooQuote[] = [];

  for (const batch of chunk(uniqueTickers, QUOTE_BATCH_SIZE)) {
    const symbolToTicker = new Map<string, string>();
    const symbols = batch.map((ticker) => {
      const symbol = getYahooSymbol(ticker, exchange);
      symbolToTicker.set(symbol, ticker);
      return symbol;
    });

    const v8Map = await fetchV8QuotesParallel(symbols);
    for (const symbol of symbols) {
      const ticker = symbolToTicker.get(symbol);
      const v8 = v8Map.get(symbol);
      if (!ticker || !v8) continue;

      results.push({
        ticker,
        exchange: exchange ?? v8.exchangeName ?? 'ASX',
        currency: v8.currency,
        currentPrice: v8.regularMarketPrice,
        previousClose: v8.previousClose,
        dailyChange: v8.dailyChange,
        dailyChangePct: v8.dailyChangePct,
        dayHigh: v8.regularMarketDayHigh,
        dayLow: v8.regularMarketDayLow,
        fiftyTwoWeekHigh: v8.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: v8.fiftyTwoWeekLow,
        // v8 chart meta omits these — leave as 0/null.
        volume: 0,
        averageVolume: 0,
        marketCap: 0,
        pe: null,
        eps: null,
        dividendYield: null,
        marketState: normalizeMarketState(v8.marketState),
      });
    }
  }

  return results;
}

export async function fetchAnalystData(ticker: string, exchange?: string): Promise<YahooAnalyst | null> {
  const yahooSymbol = getYahooSymbol(ticker, exchange);
  const url = `https://query1.finance.yahoo.com/v6/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=recommendationTrend,financialData`;

  try {
    const payload = await fetchYahooJson<QuoteSummaryResponse>(url);
    const summary = payload.quoteSummary?.result?.[0];
    const trend = summary?.recommendationTrend?.trend?.[0];
    const financialData = summary?.financialData;

    if (!trend || !financialData) {
      return null;
    }

    const strongBuy = trend.strongBuy ?? 0;
    const buy = trend.buy ?? 0;
    const hold = trend.hold ?? 0;
    const sell = trend.sell ?? 0;
    const strongSell = trend.strongSell ?? 0;
    const totalAnalysts = strongBuy + buy + hold + sell + strongSell;
    const targetMeanPrice = toNumber(financialData.targetMeanPrice);
    const targetHighPrice = toNumber(financialData.targetHighPrice);
    const targetLowPrice = toNumber(financialData.targetLowPrice);
    const currentPrice = toNumber(financialData.currentPrice);
    const recommendationMean = toNumber(financialData.recommendationMean);

    if (
      totalAnalysts === 0 ||
      targetMeanPrice == null ||
      targetHighPrice == null ||
      targetLowPrice == null ||
      currentPrice == null ||
      recommendationMean == null ||
      currentPrice <= 0
    ) {
      return null;
    }

    return {
      ticker: normalizeTicker(ticker),
      strongBuy,
      buy,
      hold,
      sell,
      strongSell,
      totalAnalysts,
      targetMeanPrice,
      targetHighPrice,
      targetLowPrice,
      recommendationMean,
      currentPrice,
      upsidePct: ((targetMeanPrice - currentPrice) / currentPrice) * 100,
    };
  } catch {
    return null;
  }
}

export async function fetchEarnings(ticker: string, exchange?: string): Promise<YahooEarnings | null> {
  const yahooSymbol = getYahooSymbol(ticker, exchange);
  const url = `https://query1.finance.yahoo.com/v6/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=calendarEvents`;

  try {
    const payload = await fetchYahooJson<QuoteSummaryResponse>(url);
    const earningsDate = payload.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0];
    const rawDate = earningsDate?.raw;

    if (typeof rawDate !== 'number') {
      return {
        ticker: normalizeTicker(ticker),
        earningsDate: null,
        daysUntilEarnings: null,
      };
    }

    const isoDate = toIsoDateFromUnix(rawDate);
    return {
      ticker: normalizeTicker(ticker),
      earningsDate: isoDate,
      daysUntilEarnings: calculateDaysUntil(isoDate),
    };
  } catch {
    return null;
  }
}

export async function fetchBatchEarnings(
  tickers: string[],
  exchange?: string
): Promise<Array<YahooEarnings | null>> {
  return Promise.all(tickers.map((ticker) => fetchEarnings(ticker, exchange)));
}

export async function fetchNews(ticker: string, maxItems = 3): Promise<YahooNewsItem[]> {
  const safeMaxItems = Math.min(Math.max(maxItems, 1), 5);
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    normalizeTicker(ticker)
  )}&newsCount=${safeMaxItems}`;

  try {
    const payload = await fetchYahooJson<SearchEndpointResponse>(url);
    return (payload.news ?? [])
      .filter((item): item is Required<Pick<SearchNewsResult, 'title' | 'publisher' | 'link'>> & SearchNewsResult => {
        return Boolean(item.title && item.publisher && item.link);
      })
      .slice(0, safeMaxItems)
      .map((item) => ({
        title: item.title,
        publisher: item.publisher,
        link: item.link,
        publishedAt:
          typeof item.providerPublishTime === 'number'
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

export async function fetchHistorical(ticker: string, exchange?: string): Promise<YahooHistorical | null> {
  const yahooSymbol = getYahooSymbol(ticker, exchange);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol
  )}?range=1y&interval=1d`;

  try {
    const payload = await fetchYahooJson<ChartEndpointResponse>(url);
    const chart = payload.chart?.result?.[0];
    const timestamps = chart?.timestamp ?? [];
    const quoteSeries = chart?.indicators?.quote?.[0];

    if (!quoteSeries || timestamps.length === 0) {
      return null;
    }

    const prices: YahooHistoricalPrice[] = [];
    for (let index = 0; index < timestamps.length; index += 1) {
      const open = quoteSeries.open?.[index];
      const high = quoteSeries.high?.[index];
      const low = quoteSeries.low?.[index];
      const close = quoteSeries.close?.[index];
      const volume = quoteSeries.volume?.[index];

      if (
        typeof open !== 'number' ||
        typeof high !== 'number' ||
        typeof low !== 'number' ||
        typeof close !== 'number' ||
        typeof volume !== 'number'
      ) {
        continue;
      }

      prices.push({
        date: toIsoDateFromUnix(timestamps[index] ?? 0),
        open,
        high,
        low,
        close,
        volume,
      });
    }

    return prices.length > 0
      ? {
          ticker: normalizeTicker(ticker),
          prices,
        }
      : null;
  } catch {
    return null;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
