'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertBanner } from '@/features/alerts/AlertBanner';
import { useAlerts } from '@/lib/alerts/use-alerts';
import type { Position, WatchlistItem } from '@/types/portfolio';
import { useDashboardData } from '@/lib/dashboard/use-dashboard-data';
import { PortfolioSummary } from './PortfolioSummary';
import { EarningsCalendar } from './EarningsCalendar';
import { HoldingCard } from './HoldingCard';
import { WatchlistCard } from './WatchlistCard';
import { EmptyDashboard } from './EmptyDashboard';
import { SortControls, type DashboardSortKey } from './SortControls';

interface SyncStatusPayload {
  connected: boolean;
  last_activity_sync: string | null;
  sync_status: 'pending' | 'syncing' | 'success' | 'error' | null;
  sync_error: string | null;
}

interface DashboardProps {
  positions: Position[];
  watchlist: WatchlistItem[];
  cashAvailable: number;
  onAskAI: (message: string) => void;
  onOpenPortfolio: (intent?: 'connect-ib' | 'add-position') => void;
  onOpenChat: () => void;
}

function sortHoldings<T extends { marketValue: number; quote: { dailyChangePct: number } | null; analyst: { upsidePct: number } | null; indicators: { rsi14: number | null } | null }>(
  items: T[],
  sortBy: DashboardSortKey
): T[] {
  const sorted = [...items];

  sorted.sort((left, right) => {
    switch (sortBy) {
      case 'daily-change':
        return (right.quote?.dailyChangePct ?? Number.NEGATIVE_INFINITY) - (left.quote?.dailyChangePct ?? Number.NEGATIVE_INFINITY);
      case 'analyst-upside':
        return (right.analyst?.upsidePct ?? Number.NEGATIVE_INFINITY) - (left.analyst?.upsidePct ?? Number.NEGATIVE_INFINITY);
      case 'rsi':
        return (left.indicators?.rsi14 ?? Number.POSITIVE_INFINITY) - (right.indicators?.rsi14 ?? Number.POSITIVE_INFINITY);
      case 'value':
      default:
        return right.marketValue - left.marketValue;
    }
  });

  return sorted;
}

export function Dashboard({
  positions,
  watchlist,
  cashAvailable,
  onAskAI,
  onOpenPortfolio,
  onOpenChat,
}: DashboardProps) {
  const [sortBy, setSortBy] = useState<DashboardSortKey>('value');
  const dashboard = useDashboardData({
    positions,
    watchlist,
    cashAvailable,
  });
  const sortedHoldings = useMemo(() => sortHoldings(dashboard.holdings, sortBy), [dashboard.holdings, sortBy]);
  const { alerts, dismissAlert, markRead } = useAlerts();

  const [syncStatus, setSyncStatus] = useState<SyncStatusPayload | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/sync/status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as SyncStatusPayload;
      setSyncStatus(data);
    } catch {
      // Non-fatal — sync indicator just won't show.
    }
  }, []);

  useEffect(() => {
    void loadSyncStatus();
  }, [loadSyncStatus]);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch('/api/portfolio/sync', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Sync failed (${res.status})`);
      }
      await loadSyncStatus();
      // Refresh Yahoo data so the dashboard reflects the new positions.
      dashboard.refresh();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [dashboard, isSyncing, loadSyncStatus]);

  const lastSyncedAt = useMemo(
    () => (syncStatus?.last_activity_sync ? new Date(syncStatus.last_activity_sync) : null),
    [syncStatus?.last_activity_sync]
  );

  if (dashboard.holdings.length === 0 && dashboard.watchlist.length === 0) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <AlertBanner
            alerts={alerts}
            onDismiss={dismissAlert}
            onMarkRead={markRead}
            onAskAbout={onAskAI}
          />
          <EmptyDashboard
            onConnectPortfolio={() => onOpenPortfolio('connect-ib')}
            onAddPosition={() => onOpenPortfolio('add-position')}
            onOpenChat={onOpenChat}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto max-w-[1440px] p-4 md:p-6 space-y-6">
        <AlertBanner alerts={alerts} onDismiss={dismissAlert} onMarkRead={markRead} onAskAbout={onAskAI} />

        <PortfolioSummary
          totalValue={dashboard.totalValue}
          dailyPnL={dashboard.dailyPnL}
          dailyPnLPct={dashboard.dailyPnLPct}
          totalPnL={dashboard.totalPnL}
          cashAvailable={dashboard.cashAvailable}
          marketState={dashboard.marketState}
          lastSyncedAt={lastSyncedAt}
          sparklineData={dashboard.sparklineData}
          hasStaleData={dashboard.hasStaleData}
          isSyncing={isSyncing}
          syncError={syncError}
          onSync={triggerSync}
        />

        <EarningsCalendar items={dashboard.upcomingEarnings} />

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="dashboard-section-heading">{`Holdings (${sortedHoldings.length})`}</div>
            <SortControls value={sortBy} onChange={setSortBy} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {sortedHoldings.map((holding, index) => (
              <HoldingCard
                key={holding.ticker}
                holding={holding}
                index={index}
                onAskAI={(ticker) => onAskAI(`Tell me about ${ticker} - what should I know right now?`)}
              />
            ))}
          </div>
        </section>

        {dashboard.watchlist.length > 0 && (
          <section className="space-y-4">
            <div className="dashboard-section-heading">{`Watchlist (${dashboard.watchlist.length})`}</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {dashboard.watchlist.map((item, index) => (
                <WatchlistCard
                  key={item.ticker}
                  item={item}
                  index={index}
                  onAskAI={(ticker) => onAskAI(`Tell me about ${ticker} - what should I know right now?`)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
