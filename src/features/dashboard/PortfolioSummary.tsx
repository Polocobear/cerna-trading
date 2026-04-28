import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Sparkline } from './Sparkline';
import { formatCurrencyDetailed, formatPercent, formatRelativeTime } from '@/lib/utils/format';
import type { YahooMarketState } from '@/lib/yahoo/types';
import { cn } from '@/lib/utils/cn';

interface PortfolioSummaryProps {
  totalValue: number;
  dailyPnL: number;
  dailyPnLPct: number;
  totalPnL: number;
  cashAvailable: number;
  marketState: YahooMarketState;
  lastSyncedAt: Date | null;
  sparklineData: number[];
  hasStaleData: boolean;
  isSyncing: boolean;
  syncError: string | null;
  onSync: () => void;
}

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function getMarketLabel(state: YahooMarketState): string {
  switch (state) {
    case 'REGULAR':
      return 'Market Open';
    case 'PRE':
      return 'Pre-Market';
    case 'POST':
      return 'After Hours';
    default:
      return 'Market Closed';
  }
}

function getMarketColor(state: YahooMarketState): string {
  switch (state) {
    case 'REGULAR':
      return 'var(--positive)';
    case 'PRE':
    case 'POST':
      return 'var(--warning)';
    default:
      return 'var(--dashboard-text-35)';
  }
}

export function PortfolioSummary({
  totalValue,
  dailyPnL,
  dailyPnLPct,
  totalPnL,
  cashAvailable,
  marketState,
  lastSyncedAt,
  sparklineData,
  hasStaleData,
  isSyncing,
  syncError,
  onSync,
}: PortfolioSummaryProps) {
  const isPositive = dailyPnL >= 0;
  const totalPnLPositive = totalPnL >= 0;
  const deltaColor = isPositive ? 'var(--positive)' : 'var(--negative)';
  const syncAgeMs = lastSyncedAt ? Date.now() - lastSyncedAt.getTime() : null;
  const isStale = syncAgeMs == null || syncAgeMs >= STALE_THRESHOLD_MS;
  const syncLabel = lastSyncedAt
    ? `Last synced ${formatRelativeTime(lastSyncedAt)}`
    : 'Never synced';

  return (
    <section className="dashboard-summary-strip">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-[180px]">
          <div className="dashboard-kicker">Total Value</div>
          <div className="text-[24px] font-bold tabular-nums leading-none" style={{ color: 'var(--dashboard-text-strong)' }}>
            {formatCurrencyDetailed(totalValue)}
          </div>
        </div>

        <div className="min-w-[180px]">
          <div className="dashboard-kicker">Today</div>
          <div className="flex items-center gap-2 text-[20px] font-semibold tabular-nums leading-none" style={{ color: deltaColor }}>
            {isPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
            <span>
              {isPositive ? '+' : '-'}
              {formatCurrencyDetailed(Math.abs(dailyPnL))}
            </span>
            <span className="text-[15px]">{`(${formatPercent(dailyPnLPct, 2)})`}</span>
          </div>
          <div
            className="mt-1 text-[13px] tabular-nums"
            style={{ color: totalPnLPositive ? 'var(--positive)' : 'var(--negative)' }}
          >
            {`(${totalPnLPositive ? '+' : '-'}${formatCurrencyDetailed(Math.abs(totalPnL))} since inception)`}
          </div>
        </div>

        <div className="min-w-[160px]">
          <div className="dashboard-kicker">Available</div>
          <div className="text-[18px] font-semibold tabular-nums" style={{ color: 'var(--dashboard-text-strong)' }}>
            Cash {formatCurrencyDetailed(cashAvailable)}
          </div>
        </div>

        <div className="hidden md:flex items-center">
          <Sparkline data={sparklineData} />
        </div>

        <div className="ml-auto flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--dashboard-text-75)' }}>
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: getMarketColor(marketState),
                boxShadow: `0 0 10px ${getMarketColor(marketState)}`,
              }}
            />
            <span>{getMarketLabel(marketState)}</span>
          </div>

          <div className="flex items-center gap-3 text-[12px]">
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 transition-smooth',
                isSyncing && 'opacity-80 cursor-wait'
              )}
              style={{
                background: 'var(--dashboard-surface-04)',
                color: 'var(--dashboard-text-55)',
                border: '1px solid var(--dashboard-surface-05)',
              }}
              aria-label={isSyncing ? 'Syncing...' : 'Sync now'}
            >
              <RefreshCw size={12} className={cn(isSyncing && 'animate-spin')} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            <span
              className="tabular-nums"
              style={{
                color: isStale ? 'var(--warning)' : 'var(--dashboard-text-35)',
              }}
            >
              {syncLabel}
            </span>
          </div>

          {syncError && (
            <div className="text-[12px]" style={{ color: 'var(--negative)' }}>
              {`Sync failed: ${syncError}`}
            </div>
          )}

          {!syncError && hasStaleData && (
            <div className="text-[12px]" style={{ color: 'var(--warning)' }}>
              Live prices may be delayed
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
