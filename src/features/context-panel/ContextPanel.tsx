'use client';

import { TrendingUp, TrendingDown, X } from 'lucide-react';
import type { Position, WatchlistItem, JournalEntry } from '@/types/portfolio';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface ContextPanelProps {
  positions: Position[];
  watchlist: WatchlistItem[];
  journal: JournalEntry[];
  cashAvailable: number;
  onSelectTicker: (ticker: string) => void;
  activeTicker?: string;
  loading?: boolean;
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function ContextPanel({
  positions,
  watchlist,
  journal,
  cashAvailable,
  onSelectTicker,
  activeTicker,
  loading,
  mobileOpen,
  onClose,
}: ContextPanelProps) {
  const openPositions = positions.filter((p) => p.status === 'open');
  const totalValue = openPositions.reduce((s, p) => s + p.shares * p.cost_basis, 0) + cashAvailable;
  const holdingsSorted = [...openPositions].sort(
    (a, b) => b.shares * b.cost_basis - a.shares * a.cost_basis
  );

  const concentrationWarning = openPositions.some((p) => {
    const v = p.shares * p.cost_basis;
    return totalValue > 0 && v / totalValue > 0.1;
  });

  const todayChange = 0;

  const panelBody = (
    <div className="flex flex-col h-full overflow-y-auto custom-scrollbar">
      {/* Summary */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-2">Portfolio</div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-36 rounded-md bg-gradient-to-r from-cerna-bg-tertiary via-cerna-bg-hover to-cerna-bg-tertiary bg-[length:200%_100%] animate-shimmer" />
            <div className="h-4 w-24 rounded-md bg-gradient-to-r from-cerna-bg-tertiary via-cerna-bg-hover to-cerna-bg-tertiary bg-[length:200%_100%] animate-shimmer" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-semibold tabular-nums text-cerna-text-primary">
              {formatCurrency(totalValue)}
            </div>
            <div className="text-sm text-cerna-text-secondary mt-1 tabular-nums">
              Cash: {formatCurrency(cashAvailable)}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-sm">
              {todayChange >= 0 ? (
                <TrendingUp size={14} className="text-cerna-profit" />
              ) : (
                <TrendingDown size={14} className="text-cerna-loss" />
              )}
              <span
                className={cn('tabular-nums', todayChange >= 0 ? 'text-cerna-profit' : 'text-cerna-loss')}
              >
                {formatPercent(todayChange)} today
              </span>
              <span className="text-cerna-text-tertiary">· {openPositions.length} positions</span>
            </div>
          </>
        )}
      </div>

      {/* Holdings */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">Holdings</div>
        <div className="space-y-1 max-h-72 overflow-y-auto custom-scrollbar">
          {holdingsSorted.length === 0 && !loading && (
            <p className="text-sm text-cerna-text-tertiary">No positions yet.</p>
          )}
          {holdingsSorted.slice(0, 10).map((p) => {
            const isActive = activeTicker && p.ticker === activeTicker;
            return (
              <button
                key={p.id}
                onClick={() => onSelectTicker(p.ticker)}
                className={cn(
                  'flex items-center justify-between w-full py-1.5 px-2 rounded-lg transition-smooth min-h-[44px] border-l-2',
                  isActive
                    ? 'bg-cerna-bg-hover border-cerna-primary'
                    : 'border-transparent hover:bg-cerna-bg-hover'
                )}
              >
                <span className="font-semibold text-cerna-text-primary">{p.ticker}</span>
                <span className="text-xs text-cerna-text-tertiary tabular-nums">{p.shares} sh</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Watchlist */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">Watchlist</div>
        <div className="space-y-1">
          {watchlist.length === 0 && (
            <p className="text-sm text-cerna-text-tertiary">Nothing on watchlist.</p>
          )}
          {watchlist.slice(0, 5).map((w) => (
            <button
              key={w.id}
              onClick={() => onSelectTicker(w.ticker)}
              className="flex items-center justify-between w-full py-1.5 px-2 rounded-lg hover:bg-cerna-bg-hover transition-smooth min-h-[44px]"
            >
              <span className="font-semibold text-cerna-text-primary">{w.ticker}</span>
              <span className="text-xs text-cerna-text-tertiary tabular-nums">
                {w.target_price ? formatCurrency(w.target_price) : '—'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">Recent</div>
        <div className="space-y-1.5">
          {journal.length === 0 && (
            <p className="text-sm text-cerna-text-tertiary">No recent activity.</p>
          )}
          {journal.slice(0, 5).map((j) => (
            <div key={j.id} className="text-sm text-cerna-text-secondary">
              <span className="capitalize">{j.action}</span> {j.ticker}
              <span className="text-cerna-text-tertiary"> · {formatDate(j.created_at)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SMSF */}
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">SMSF</div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              concentrationWarning ? 'bg-amber-500' : 'bg-emerald-500'
            )}
          />
          <span className="text-cerna-text-secondary">
            {concentrationWarning ? 'Concentration >10%' : 'Concentration OK'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l border-cerna-border glass">
        {panelBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/60 animate-fade-in" onClick={onClose} />
          <div className="w-[85vw] max-w-sm h-full glass-elevated animate-slide-in-right flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cerna-border">
              <span className="text-sm font-semibold text-cerna-text-primary">Portfolio</span>
              <button
                onClick={onClose}
                className="p-2 -m-2 text-cerna-text-tertiary hover:text-cerna-text-primary transition-smooth"
              >
                <X size={20} />
              </button>
            </div>
            {panelBody}
          </div>
        </div>
      )}
    </>
  );
}
