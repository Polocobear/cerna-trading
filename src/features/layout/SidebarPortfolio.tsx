'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Plug } from 'lucide-react';
import type { Position } from '@/types/portfolio';
import { usePrices } from '@/lib/prices/use-prices';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { IBSetupWizard } from '@/features/portfolio/IBSetupWizard';

interface SidebarPortfolioProps {
  positions: Position[];
  cashAvailable: number;
}

interface SyncStatus {
  connected: boolean;
  last_activity_sync: string | null;
  sync_status: 'pending' | 'syncing' | 'success' | 'error' | null;
  sync_error: string | null;
}

function formatSyncTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SidebarPortfolio({ positions, cashAvailable }: SidebarPortfolioProps) {
  const openPositions = positions.filter((p) => p.status === 'open');
  const tickers = openPositions.map((p) => p.ticker);
  const { prices, marketState } = usePrices(tickers);

  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/sync/status');
      if (!res.ok) return;
      const data = (await res.json()) as SyncStatus;
      setSync(data);
    } catch {
      // swallow
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function triggerSync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await fetch('/api/portfolio/sync', { method: 'POST' });
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  }

  const valueFromPrices = openPositions.reduce((s, p) => {
    const px = prices[p.ticker]?.price ?? p.cost_basis;
    return s + p.shares * px;
  }, 0);
  const totalValue = valueFromPrices + cashAvailable;

  const todayChange = openPositions.reduce((s, p) => {
    const change = prices[p.ticker]?.change ?? 0;
    return s + p.shares * change;
  }, 0);
  const basePct = valueFromPrices - todayChange;
  const todayChangePct = basePct > 0 ? (todayChange / basePct) * 100 : 0;

  const isMarketOpen = marketState === 'REGULAR';

  return (
    <>
      <div
        className="px-4 py-3 border-t"
        style={{
          borderColor: 'rgba(255,255,255,0.06)',
          background: 'rgba(124,91,240,0.05)',
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-[rgba(255,255,255,0.4)] font-medium">
            Portfolio
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[rgba(255,255,255,0.4)]">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isMarketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-[rgba(255,255,255,0.3)]'
              )}
            />
            {isMarketOpen ? 'Open' : 'Closed'}
          </span>
        </div>
        <div className="mt-1 text-lg font-semibold tabular-nums text-cerna-text-primary leading-tight">
          {formatCurrency(totalValue)}
        </div>
        <div className="text-[11px] text-[rgba(255,255,255,0.4)] tabular-nums">
          Cash {formatCurrency(cashAvailable)}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] tabular-nums">
          {todayChange >= 0 ? (
            <TrendingUp size={12} className="text-cerna-profit" />
          ) : (
            <TrendingDown size={12} className="text-cerna-loss" />
          )}
          <span className={todayChange >= 0 ? 'text-cerna-profit' : 'text-cerna-loss'}>
            {formatPercent(todayChangePct, 2)}
          </span>
          <span className="text-[rgba(255,255,255,0.3)]">· {openPositions.length} pos</span>
        </div>

        {/* Sync status */}
        <div className="mt-2 flex items-center justify-between gap-2">
          {sync?.connected && sync.sync_status === 'error' ? (
            <div
              className="flex items-center gap-1.5 text-[11px] text-amber-400/80"
              title={sync.sync_error ?? 'Sync error'}
            >
              <AlertTriangle size={11} />
              Sync error
            </div>
          ) : sync?.connected && sync.last_activity_sync ? (
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Last synced {formatSyncTime(sync.last_activity_sync)}
            </span>
          ) : sync?.connected ? (
            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Awaiting first sync
            </span>
          ) : (
            <button
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-1 text-[11px] text-cerna-primary hover:underline"
            >
              <Plug size={11} />
              Connect broker
            </button>
          )}

          {sync?.connected && (
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="text-[10px] text-[rgba(255,255,255,0.4)] hover:text-cerna-text-primary transition flex items-center gap-1"
              aria-label="Sync now"
            >
              <RefreshCw size={10} className={syncing ? 'animate-spin' : ''} />
              Sync now
            </button>
          )}
        </div>
      </div>

      {showWizard && (
        <IBSetupWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            void loadStatus();
          }}
        />
      )}
    </>
  );
}
