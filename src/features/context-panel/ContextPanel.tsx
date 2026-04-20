'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Position, WatchlistItem, JournalEntry } from '@/types/portfolio';
import { formatCurrency, formatPercent, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface ContextPanelProps {
  positions: Position[];
  watchlist: WatchlistItem[];
  journal: JournalEntry[];
  cashAvailable: number;
  onSelectTicker: (ticker: string) => void;
}

export function ContextPanel({
  positions,
  watchlist,
  journal,
  cashAvailable,
  onSelectTicker,
}: ContextPanelProps) {
  const openPositions = positions.filter((p) => p.status === 'open');
  const totalValue = openPositions.reduce((sum, p) => sum + p.shares * p.cost_basis, 0) + cashAvailable;

  const holdingsSorted = [...openPositions].sort(
    (a, b) => Math.abs(b.cost_basis) - Math.abs(a.cost_basis)
  );

  const concentrationWarning = openPositions.some((p) => {
    const positionValue = p.shares * p.cost_basis;
    return totalValue > 0 && positionValue / totalValue > 0.1;
  });

  const todayChange = 0;

  return (
    <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l border-cerna-border bg-cerna-bg-secondary overflow-y-auto">
      {/* Portfolio summary */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-2">Portfolio</div>
        <div className="text-2xl font-bold text-cerna-text-primary">{formatCurrency(totalValue)}</div>
        <div className="text-sm text-cerna-text-secondary mt-1">
          Cash: {formatCurrency(cashAvailable)}
        </div>
        <div className="flex items-center gap-1.5 mt-2 text-sm">
          {todayChange >= 0 ? (
            <TrendingUp size={14} className="text-cerna-profit" />
          ) : (
            <TrendingDown size={14} className="text-cerna-loss" />
          )}
          <span className={todayChange >= 0 ? 'text-cerna-profit' : 'text-cerna-loss'}>
            {formatPercent(todayChange)} today
          </span>
          <span className="text-cerna-text-tertiary">· {openPositions.length} positions</span>
        </div>
      </div>

      {/* Holdings */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">Holdings</div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {holdingsSorted.length === 0 && (
            <p className="text-sm text-cerna-text-tertiary">No positions yet.</p>
          )}
          {holdingsSorted.slice(0, 10).map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectTicker(p.ticker)}
              className="flex items-center justify-between w-full py-1.5 px-2 rounded hover:bg-cerna-bg-hover transition"
            >
              <span className="font-semibold text-cerna-text-primary">{p.ticker}</span>
              <span className="text-xs text-cerna-text-tertiary">{p.shares} sh</span>
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist */}
      <div className="p-5 border-b border-cerna-border">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">Watchlist</div>
        <div className="space-y-1.5">
          {watchlist.length === 0 && (
            <p className="text-sm text-cerna-text-tertiary">Nothing on watchlist.</p>
          )}
          {watchlist.slice(0, 5).map((w) => (
            <button
              key={w.id}
              onClick={() => onSelectTicker(w.ticker)}
              className="flex items-center justify-between w-full py-1.5 px-2 rounded hover:bg-cerna-bg-hover transition"
            >
              <span className="font-semibold text-cerna-text-primary">{w.ticker}</span>
              <span className="text-xs text-cerna-text-tertiary">
                {w.target_price ? formatCurrency(w.target_price) : '—'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent activity */}
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

      {/* SMSF compliance */}
      <div className="p-5">
        <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-3">SMSF</div>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              concentrationWarning ? 'bg-cerna-primary' : 'bg-cerna-profit'
            )}
            style={{
              backgroundColor: concentrationWarning ? 'var(--color-warning)' : 'var(--color-success)',
            }}
          />
          <span className="text-cerna-text-secondary">
            {concentrationWarning ? 'Concentration >10%' : 'Concentration OK'}
          </span>
        </div>
      </div>
    </aside>
  );
}
