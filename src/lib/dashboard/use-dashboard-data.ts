'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateIndicators, type TechnicalIndicators } from '@/lib/indicators/calculator';
import type {
  YahooAnalyst,
  YahooEarnings,
  YahooHistorical,
  YahooNewsItem,
  YahooQuote,
} from '@/lib/yahoo/types';
import type { Position, WatchlistItem } from '@/types/portfolio';

type MarketState = 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';
type LoadStatus = 'idle' | 'loading' | 'loaded';

const QUOTE_TTL_MS = 2 * 60 * 1000;
const DETAILS_TTL_MS = 60 * 60 * 1000;
const QUOTE_REFRESH_MS = 2 * 60 * 1000;
const DETAIL_REFRESH_MS = 60 * 60 * 1000;
const DETAIL_STAGGER_MS = 200;

interface DashboardTicker {
  ticker: string;
  exchange: string;
}

interface SectionLoadingState {
  analyst: boolean;
  indicators: boolean;
  earnings: boolean;
  news: boolean;
}

export interface HoldingData {
  ticker: string;
  companyName: string;
  exchange: string;
  shares: number;
  costBasis: number;
  avgCostPerShare: number;
  quote: YahooQuote | null;
  analyst: YahooAnalyst | null;
  earnings: YahooEarnings | null;
  news: YahooNewsItem[];
  indicators: TechnicalIndicators | null;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  portfolioWeight: number;
  loading: SectionLoadingState;
}

export interface WatchlistData {
  ticker: string;
  companyName: string;
  exchange: string;
  targetPrice: number | null;
  notes: string | null;
  quote: YahooQuote | null;
  analyst: YahooAnalyst | null;
  indicators: TechnicalIndicators | null;
  news: YahooNewsItem[];
  distanceToTarget: number | null;
  loading: Omit<SectionLoadingState, 'earnings'>;
}

export interface DashboardData {
  totalValue: number;
  totalCost: number;
  totalPnL: number;
  totalPnLPct: number;
  dailyPnL: number;
  dailyPnLPct: number;
  cashAvailable: number;
  marketState: MarketState;
  holdings: HoldingData[];
  watchlist: WatchlistData[];
  upcomingEarnings: Array<{
    ticker: string;
    companyName: string;
    earningsDate: string;
    daysUntil: number;
  }>;
  sparklineData: number[];
  isLoading: boolean;
  isRefreshing: boolean;
  quotesLoaded: boolean;
  analystLoaded: boolean;
  indicatorsLoaded: boolean;
  lastUpdated: Date | null;
  hasStaleData: boolean;
  refresh: () => void;
}

interface UseDashboardDataOptions {
  positions: Position[];
  watchlist: WatchlistItem[];
  cashAvailable: number;
}

interface QuotesResponse {
  quotes: YahooQuote[];
}

interface AnalystResponse {
  analyst: YahooAnalyst | null;
}

interface EarningsResponse {
  earnings: Array<YahooEarnings | null>;
}

interface NewsResponse {
  news: YahooNewsItem[];
}

interface HistoricalResponse {
  historical: YahooHistorical | null;
}

function groupTickersByExchange(entries: DashboardTicker[]): Array<{ exchange: string; tickers: string[] }> {
  const grouped = new Map<string, Set<string>>();

  for (const entry of entries) {
    const exchange = entry.exchange || 'ASX';
    const set = grouped.get(exchange) ?? new Set<string>();
    set.add(entry.ticker);
    grouped.set(exchange, set);
  }

  return Array.from(grouped.entries()).map(([exchange, tickers]) => ({
    exchange,
    tickers: Array.from(tickers),
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function dedupeEntries(entries: DashboardTicker[]): DashboardTicker[] {
  const seen = new Map<string, DashboardTicker>();
  for (const entry of entries) {
    const key = entry.ticker.toUpperCase();
    if (!seen.has(key)) {
      seen.set(key, { ticker: key, exchange: entry.exchange || 'ASX' });
    }
  }
  return Array.from(seen.values());
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

function resolveMarketState(quotes: Record<string, YahooQuote>): MarketState {
  const states = Object.values(quotes).map((quote) => quote.marketState);
  if (states.includes('REGULAR')) return 'REGULAR';
  if (states.includes('PRE')) return 'PRE';
  if (states.includes('POST')) return 'POST';
  return 'CLOSED';
}

function getRelativeNow(): number {
  return Date.now();
}

function computeSparkline(
  holdings: Position[],
  historicalByTicker: Record<string, YahooHistorical | null>
): number[] {
  const dateMap = new Map<string, number>();

  for (const holding of holdings) {
    const history = historicalByTicker[holding.ticker];
    if (!history) continue;
    for (const point of history.prices.slice(-30)) {
      const current = dateMap.get(point.date) ?? 0;
      dateMap.set(point.date, current + point.close * holding.shares);
    }
  }

  return Array.from(dateMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-30)
    .map(([, value]) => Number(value.toFixed(2)));
}

export function useDashboardData(options: UseDashboardDataOptions): DashboardData {
  const openPositions = useMemo(
    () => options.positions.filter((position) => position.status === 'open'),
    [options.positions]
  );

  const tickerEntries = useMemo(
    () =>
      dedupeEntries([
        ...openPositions.map((position) => ({
          ticker: position.ticker.toUpperCase(),
          exchange: position.exchange || 'ASX',
        })),
        ...options.watchlist.map((item) => ({
          ticker: item.ticker.toUpperCase(),
          exchange: item.exchange || 'ASX',
        })),
      ]),
    [openPositions, options.watchlist]
  );

  const holdingEntries = useMemo(
    () =>
      dedupeEntries(
        openPositions.map((position) => ({
          ticker: position.ticker.toUpperCase(),
          exchange: position.exchange || 'ASX',
        }))
      ),
    [openPositions]
  );

  const [quotes, setQuotes] = useState<Record<string, YahooQuote>>({});
  const [analysts, setAnalysts] = useState<Record<string, YahooAnalyst | null>>({});
  const [earnings, setEarnings] = useState<Record<string, YahooEarnings | null>>({});
  const [news, setNews] = useState<Record<string, YahooNewsItem[]>>({});
  const [historical, setHistorical] = useState<Record<string, YahooHistorical | null>>({});
  const [indicators, setIndicators] = useState<Record<string, TechnicalIndicators | null>>({});
  const [quoteStatus, setQuoteStatus] = useState<LoadStatus>('idle');
  const [detailRefreshing, setDetailRefreshing] = useState(false);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [hasStaleData, setHasStaleData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analystStatus, setAnalystStatus] = useState<Record<string, LoadStatus>>({});
  const [earningsStatus, setEarningsStatus] = useState<Record<string, LoadStatus>>({});
  const [newsStatus, setNewsStatus] = useState<Record<string, LoadStatus>>({});
  const [historicalStatus, setHistoricalStatus] = useState<Record<string, LoadStatus>>({});

  const quotesAbortRef = useRef<AbortController | null>(null);
  const quoteFetchedAtRef = useRef<number>(0);
  const detailFetchedAtRef = useRef<number>(0);
  const detailRequestIdRef = useRef(0);
  const quotesRef = useRef<Record<string, YahooQuote>>({});
  const earningsRef = useRef<Record<string, YahooEarnings | null>>({});

  useEffect(() => {
    quotesRef.current = quotes;
  }, [quotes]);

  useEffect(() => {
    earningsRef.current = earnings;
  }, [earnings]);

  const loadQuotes = useCallback(
    async (force = false, background = false) => {
      if (tickerEntries.length === 0) {
        setQuotes({});
        setQuoteStatus('loaded');
        return;
      }

      const now = getRelativeNow();
      if (!force && quoteFetchedAtRef.current > 0 && now - quoteFetchedAtRef.current < QUOTE_TTL_MS) {
        return;
      }

      quotesAbortRef.current?.abort();
      const controller = new AbortController();
      quotesAbortRef.current = controller;

      if (!background) {
        setQuoteStatus('loading');
      } else {
        setQuoteRefreshing(true);
      }

      const grouped = groupTickersByExchange(tickerEntries);
      const settled = await Promise.allSettled(
        grouped.map(async (group) => {
          const params = new URLSearchParams({
            tickers: group.tickers.join(','),
            exchange: group.exchange,
          });
          return fetchJson<QuotesResponse>(`/api/market-data/quotes?${params.toString()}`, controller.signal);
        })
      );

      if (controller.signal.aborted) return;

      const nextQuotes = { ...quotesRef.current };
      let sawSuccess = false;
      let sawFailure = false;

      for (const result of settled) {
        if (result.status !== 'fulfilled') {
          sawFailure = true;
          continue;
        }
        sawSuccess = true;
        for (const quote of result.value.quotes) {
          nextQuotes[quote.ticker] = quote;
        }
      }

      if (sawSuccess) {
        quotesRef.current = nextQuotes;
        setQuotes(nextQuotes);
        setLastUpdated(new Date());
        quoteFetchedAtRef.current = now;
        setHasStaleData(sawFailure);
      } else if (sawFailure) {
        setHasStaleData(true);
      }

      setQuoteStatus('loaded');
      setQuoteRefreshing(false);
    },
    [tickerEntries]
  );

  const loadDetails = useCallback(
    async (force = false) => {
      if (tickerEntries.length === 0) {
        setDetailRefreshing(false);
        return;
      }

      const now = getRelativeNow();
      if (!force && detailFetchedAtRef.current > 0 && now - detailFetchedAtRef.current < DETAILS_TTL_MS) {
        return;
      }

      detailRequestIdRef.current += 1;
      const requestId = detailRequestIdRef.current;
      setDetailRefreshing(true);

      setAnalystStatus((prev) => {
        const next = { ...prev };
        for (const entry of tickerEntries) next[entry.ticker] = 'loading';
        return next;
      });
      setNewsStatus((prev) => {
        const next = { ...prev };
        for (const entry of tickerEntries) next[entry.ticker] = 'loading';
        return next;
      });
      setHistoricalStatus((prev) => {
        const next = { ...prev };
        for (const entry of tickerEntries) next[entry.ticker] = 'loading';
        return next;
      });
      setEarningsStatus((prev) => {
        const next = { ...prev };
        for (const entry of holdingEntries) next[entry.ticker] = 'loading';
        return next;
      });

      const earningsSettled = await Promise.allSettled(
        groupTickersByExchange(holdingEntries).map(async (group) => {
          const params = new URLSearchParams({
            tickers: group.tickers.join(','),
            exchange: group.exchange,
          });
          return fetchJson<EarningsResponse>(`/api/market-data/earnings?${params.toString()}`);
        })
      );

      if (requestId !== detailRequestIdRef.current) return;

      const nextEarnings = { ...earningsRef.current };
      let detailFailure = false;
      for (const result of earningsSettled) {
        if (result.status !== 'fulfilled') {
          detailFailure = true;
          continue;
        }
        for (const item of result.value.earnings) {
          if (!item) continue;
          nextEarnings[item.ticker] = item;
        }
      }
      earningsRef.current = nextEarnings;
      setEarnings(nextEarnings);
      setEarningsStatus((prev) => {
        const next = { ...prev };
        for (const entry of holdingEntries) next[entry.ticker] = 'loaded';
        return next;
      });

      for (let index = 0; index < tickerEntries.length; index += 1) {
        if (requestId !== detailRequestIdRef.current) return;
        const entry = tickerEntries[index];
        if (index > 0) {
          await delay(DETAIL_STAGGER_MS);
        }

        const analystParams = new URLSearchParams({
          ticker: entry.ticker,
          exchange: entry.exchange,
        });
        const newsParams = new URLSearchParams({
          ticker: entry.ticker,
          count: '3',
        });
        const historicalParams = new URLSearchParams({
          ticker: entry.ticker,
          exchange: entry.exchange,
        });

        try {
          const analystResponse = await fetchJson<AnalystResponse>(
            `/api/market-data/analyst?${analystParams.toString()}`
          );
          if (requestId !== detailRequestIdRef.current) return;
          setAnalysts((prev) => ({
            ...prev,
            [entry.ticker]: analystResponse.analyst,
          }));
        } catch {
          detailFailure = true;
          setAnalysts((prev) => ({
            ...prev,
            [entry.ticker]: prev[entry.ticker] ?? null,
          }));
        } finally {
          setAnalystStatus((prev) => ({
            ...prev,
            [entry.ticker]: 'loaded',
          }));
        }

        try {
          const historicalResponse = await fetchJson<HistoricalResponse>(
            `/api/market-data/historical?${historicalParams.toString()}`
          );
          if (requestId !== detailRequestIdRef.current) return;
          const historicalResult = historicalResponse.historical;
          setHistorical((prev) => ({
            ...prev,
            [entry.ticker]: historicalResult,
          }));

          const currentPrice =
            quotesRef.current[entry.ticker]?.currentPrice ??
            historicalResult?.prices[historicalResult.prices.length - 1]?.close ??
            null;

          setIndicators((prev) => ({
            ...prev,
            [entry.ticker]:
              historicalResult && currentPrice != null
                ? calculateIndicators(
                    historicalResult.prices.map((price) => ({
                      close: price.close,
                      volume: price.volume,
                    })),
                    currentPrice
                  )
                : null,
          }));
        } catch {
          detailFailure = true;
          setHistorical((prev) => ({
            ...prev,
            [entry.ticker]: prev[entry.ticker] ?? null,
          }));
          setIndicators((prev) => ({
            ...prev,
            [entry.ticker]: prev[entry.ticker] ?? null,
          }));
        } finally {
          setHistoricalStatus((prev) => ({
            ...prev,
            [entry.ticker]: 'loaded',
          }));
        }

        try {
          const newsResponse = await fetchJson<NewsResponse>(`/api/market-data/news?${newsParams.toString()}`);
          if (requestId !== detailRequestIdRef.current) return;
          setNews((prev) => ({
            ...prev,
            [entry.ticker]: newsResponse.news,
          }));
        } catch {
          detailFailure = true;
          setNews((prev) => ({
            ...prev,
            [entry.ticker]: prev[entry.ticker] ?? [],
          }));
        } finally {
          setNewsStatus((prev) => ({
            ...prev,
            [entry.ticker]: 'loaded',
          }));
        }
      }

      if (requestId !== detailRequestIdRef.current) return;

      detailFetchedAtRef.current = now;
      setHasStaleData((prev) => prev || detailFailure);
      setDetailRefreshing(false);
    },
    [holdingEntries, tickerEntries]
  );

  useEffect(() => {
    setHasStaleData(false);
    quoteFetchedAtRef.current = 0;
    detailFetchedAtRef.current = 0;
    void (async () => {
      await loadQuotes(true, false);
      await loadDetails(true);
    })();

    return () => {
      quotesAbortRef.current?.abort();
      detailRequestIdRef.current += 1;
    };
  }, [loadDetails, loadQuotes]);

  useEffect(() => {
    if (quoteStatus !== 'loaded') return;

    function shouldPollQuotes() {
      const state = resolveMarketState(quotes);
      return state === 'REGULAR' || state === 'PRE' || state === 'POST';
    }

    let quoteInterval: ReturnType<typeof setInterval> | null = null;
    let detailInterval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (quoteInterval == null && shouldPollQuotes()) {
        quoteInterval = setInterval(() => {
          void loadQuotes(true, true);
        }, QUOTE_REFRESH_MS);
      }
      if (detailInterval == null) {
        detailInterval = setInterval(() => {
          void loadDetails(true);
        }, DETAIL_REFRESH_MS);
      }
    }

    function stopPolling() {
      if (quoteInterval) {
        clearInterval(quoteInterval);
        quoteInterval = null;
      }
      if (detailInterval) {
        clearInterval(detailInterval);
        detailInterval = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void loadQuotes(true, true);
        startPolling();
      } else {
        stopPolling();
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadDetails, loadQuotes, quoteStatus, quotes]);

  const totalHoldingsValue = useMemo(
    () =>
      openPositions.reduce((sum, position) => {
        const currentPrice = quotes[position.ticker]?.currentPrice ?? position.cost_basis;
        return sum + position.shares * currentPrice;
      }, 0),
    [openPositions, quotes]
  );

  const holdings = useMemo<HoldingData[]>(
    () =>
      openPositions.map((position) => {
        const quote = quotes[position.ticker] ?? null;
        const analyst = analysts[position.ticker] ?? null;
        const earning = earnings[position.ticker] ?? null;
        const latestNews = news[position.ticker] ?? [];
        const indicator = indicators[position.ticker] ?? null;
        const avgCostPerShare = position.cost_basis;
        const costBasis = avgCostPerShare * position.shares;
        const currentPrice = quote?.currentPrice ?? avgCostPerShare;
        const marketValue = currentPrice * position.shares;
        const unrealizedPnL = marketValue - costBasis;
        const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

        return {
          ticker: position.ticker,
          companyName: position.company_name ?? position.ticker,
          exchange: position.exchange,
          shares: position.shares,
          costBasis,
          avgCostPerShare,
          quote,
          analyst,
          earnings: earning,
          news: latestNews,
          indicators: indicator,
          marketValue,
          unrealizedPnL,
          unrealizedPnLPct,
          portfolioWeight: totalHoldingsValue > 0 ? (marketValue / totalHoldingsValue) * 100 : 0,
          loading: {
            analyst: analystStatus[position.ticker] !== 'loaded',
            indicators: historicalStatus[position.ticker] !== 'loaded',
            earnings: earningsStatus[position.ticker] !== 'loaded',
            news: newsStatus[position.ticker] !== 'loaded',
          },
        };
      }),
    [
      analysts,
      analystStatus,
      earnings,
      earningsStatus,
      historicalStatus,
      indicators,
      news,
      newsStatus,
      openPositions,
      quotes,
      totalHoldingsValue,
    ]
  );

  const watchlist = useMemo<WatchlistData[]>(
    () =>
      options.watchlist.map((item) => {
        const quote = quotes[item.ticker] ?? null;
        const analyst = analysts[item.ticker] ?? null;
        const indicator = indicators[item.ticker] ?? null;
        const currentPrice = quote?.currentPrice ?? null;

        return {
          ticker: item.ticker,
          companyName: item.company_name ?? item.ticker,
          exchange: item.exchange,
          targetPrice: item.target_price,
          notes: item.notes,
          quote,
          analyst,
          indicators: indicator,
          news: news[item.ticker] ?? [],
          distanceToTarget:
            item.target_price != null && currentPrice != null && currentPrice > 0
              ? ((item.target_price - currentPrice) / currentPrice) * 100
              : null,
          loading: {
            analyst: analystStatus[item.ticker] !== 'loaded',
            indicators: historicalStatus[item.ticker] !== 'loaded',
            news: newsStatus[item.ticker] !== 'loaded',
          },
        };
      }),
    [analystStatus, analysts, historicalStatus, indicators, news, newsStatus, options.watchlist, quotes]
  );

  const totalCost = useMemo(
    () => openPositions.reduce((sum, position) => sum + position.shares * position.cost_basis, 0),
    [openPositions]
  );

  const dailyPnL = useMemo(
    () =>
      openPositions.reduce((sum, position) => {
        const change = quotes[position.ticker]?.dailyChange ?? 0;
        return sum + position.shares * change;
      }, 0),
    [openPositions, quotes]
  );

  const totalValue = totalHoldingsValue + options.cashAvailable;
  const totalPnL = totalHoldingsValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const priorValue = totalValue - dailyPnL;
  const dailyPnLPct = priorValue > 0 ? (dailyPnL / priorValue) * 100 : 0;

  const sparklineData = useMemo(() => computeSparkline(openPositions, historical), [historical, openPositions]);

  const upcomingEarnings = useMemo(
    () =>
      holdings
        .filter(
          (holding): holding is HoldingData & { earnings: YahooEarnings } =>
            Boolean(
              holding.earnings &&
                holding.earnings.earningsDate &&
                holding.earnings.daysUntilEarnings != null &&
                holding.earnings.daysUntilEarnings >= 0
            )
        )
        .map((holding) => ({
          ticker: holding.ticker,
          companyName: holding.companyName,
          earningsDate: holding.earnings.earningsDate!,
          daysUntil: holding.earnings.daysUntilEarnings!,
        }))
        .sort((left, right) => left.daysUntil - right.daysUntil),
    [holdings]
  );

  const refresh = useCallback(() => {
    setHasStaleData(false);
    setQuoteRefreshing(true);
    setDetailRefreshing(true);
    void (async () => {
      await loadQuotes(true, true);
      await loadDetails(true);
    })();
  }, [loadDetails, loadQuotes]);

  const analystLoaded =
    tickerEntries.length === 0 ||
    tickerEntries.every((entry) => analystStatus[entry.ticker] === 'loaded');
  const indicatorsLoaded =
    tickerEntries.length === 0 ||
    tickerEntries.every((entry) => historicalStatus[entry.ticker] === 'loaded');

  return {
    totalValue,
    totalCost,
    totalPnL,
    totalPnLPct,
    dailyPnL,
    dailyPnLPct,
    cashAvailable: options.cashAvailable,
    marketState: resolveMarketState(quotes),
    holdings,
    watchlist,
    upcomingEarnings,
    sparklineData,
    isLoading: quoteStatus === 'loading',
    isRefreshing: quoteRefreshing || detailRefreshing,
    quotesLoaded: quoteStatus === 'loaded',
    analystLoaded,
    indicatorsLoaded,
    lastUpdated,
    hasStaleData,
    refresh,
  };
}
