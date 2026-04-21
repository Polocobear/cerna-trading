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
  lastUpdated: Date | null;
  sparklineData: number[];
  hasStaleData: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

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
  lastUpdated,
  sparklineData,
  hasStaleData,
  isRefreshing,
  onRefresh,
}: PortfolioSummaryProps) {
  const isPositive = dailyPnL >= 0;
  const totalPnLPositive = totalPnL >= 0;
  const deltaColor = isPositive ? 'var(--positive)' : 'var(--negative)';

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
              onClick={onRefresh}
              className={cn(
                'flex items-center gap-1 rounded-full px-2.5 py-1 transition-smooth',
              isRefreshing && 'opacity-80'
            )}
            style={{
                background: 'var(--dashboard-surface-04)',
                color: 'var(--dashboard-text-55)',
                border: '1px solid var(--dashboard-surface-05)',
              }}
            >
              <RefreshCw size={12} className={cn(isRefreshing && 'animate-spin')} />
              <span>Refresh</span>
            </button>
            <span className="tabular-nums" style={{ color: 'var(--dashboard-text-35)' }}>
              {`Updated ${formatRelativeTime(lastUpdated)}`}
            </span>
          </div>

          {hasStaleData && (
            <div className="text-[12px]" style={{ color: 'var(--warning)' }}>
              Data may be delayed
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
