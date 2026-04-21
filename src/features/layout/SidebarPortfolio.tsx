'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Position } from '@/types/portfolio';
import { usePrices } from '@/lib/prices/use-prices';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface SidebarPortfolioProps {
  positions: Position[];
  cashAvailable: number;
}

export function SidebarPortfolio({ positions, cashAvailable }: SidebarPortfolioProps) {
  const openPositions = positions.filter((p) => p.status === 'open');
  const tickers = openPositions.map((p) => p.ticker);
  const { prices, marketState } = usePrices(tickers);

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
    </div>
  );
}
