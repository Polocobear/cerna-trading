'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ClientPriceData {
  price: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
}

interface UsePricesResult {
  prices: Record<string, ClientPriceData>;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  marketState: string | null;
}

const POLL_INTERVAL = 2 * 60 * 1000;

export function usePrices(tickers: string[]): UsePricesResult {
  const [prices, setPrices] = useState<Record<string, ClientPriceData>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const key = tickers.slice().sort().join(',');

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) {
      setPrices({});
      return;
    }
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/prices?tickers=${encodeURIComponent(tickers.join(','))}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Price fetch failed: ${res.status}`);
      const data = (await res.json()) as {
        prices: Record<string, ClientPriceData>;
        errors?: string[];
      };
      setPrices(data.prices);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void fetchPrices();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        void fetchPrices();
      }, POLL_INTERVAL);
    }
    function stopPolling() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void fetchPrices();
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
      inFlight.current?.abort();
    };
  }, [fetchPrices]);

  const marketState =
    Object.values(prices).find((p) => p.marketState)?.marketState ?? null;

  return { prices, isLoading, error, refetch: fetchPrices, marketState };
}
