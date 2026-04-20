'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Position } from '@/types/portfolio';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { Skeleton } from '@/features/chat/Skeleton';
import { cn } from '@/lib/utils/cn';

interface PositionCardProps {
  position: Position;
  currentPrice?: number;
  priceLoading?: boolean;
  onAnalyze: (ticker: string) => void;
  onClose: (position: Position) => void;
  onDelete: (id: string) => void;
}

export function PositionCard({
  position,
  currentPrice,
  priceLoading,
  onAnalyze,
  onClose,
  onDelete,
}: PositionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const effectivePrice = currentPrice ?? position.cost_basis;
  const positionValue = position.shares * effectivePrice;
  const pnlDollar = position.shares * (effectivePrice - position.cost_basis);
  const pnlPct = position.cost_basis > 0 ? ((effectivePrice - position.cost_basis) / position.cost_basis) * 100 : 0;

  return (
    <div className="p-4 rounded-xl glass hover:border-cerna-border-hover transition-smooth">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold font-mono text-cerna-text-primary">{position.ticker}</span>
            <span className="text-xs text-cerna-text-tertiary">{position.exchange}</span>
          </div>
          {position.company_name && (
            <p className="text-sm text-cerna-text-secondary">{position.company_name}</p>
          )}
        </div>
        <div className="text-right">
          {priceLoading && currentPrice === undefined ? (
            <Skeleton variant="metric" className="ml-auto" />
          ) : currentPrice === undefined ? (
            <div className="text-sm text-cerna-text-tertiary tabular-nums" title="Price unavailable">
              --
            </div>
          ) : (
            <>
              <div className="text-sm text-cerna-text-primary tabular-nums">
                {formatCurrency(positionValue)}
              </div>
              <div className="flex items-center gap-1 justify-end text-xs tabular-nums">
                {pnlPct >= 0 ? (
                  <TrendingUp size={12} className="text-cerna-profit" />
                ) : (
                  <TrendingDown size={12} className="text-cerna-loss" />
                )}
                <span className={cn(pnlPct >= 0 ? 'text-cerna-profit' : 'text-cerna-loss')}>
                  {pnlDollar >= 0 ? '+' : '-'}
                  {formatCurrency(Math.abs(pnlDollar))} ({formatPercent(pnlPct, 1)})
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-cerna-text-tertiary">Shares</div>
          <div className="text-cerna-text-primary tabular-nums">{position.shares}</div>
        </div>
        <div>
          <div className="text-cerna-text-tertiary">Cost</div>
          <div className="text-cerna-text-primary tabular-nums">{formatCurrency(position.cost_basis)}</div>
        </div>
        <div>
          <div className="text-cerna-text-tertiary">Current</div>
          <div className="text-cerna-text-primary tabular-nums">
            {currentPrice === undefined ? '--' : formatCurrency(currentPrice)}
          </div>
        </div>
      </div>

      {position.thesis && (
        <div className="mt-3 text-sm text-cerna-text-secondary">
          <p className={expanded ? '' : 'line-clamp-2'}>{position.thesis}</p>
          {position.thesis.length > 120 && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-xs text-cerna-primary mt-1 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onAnalyze(position.ticker)}
          className="px-3 py-1.5 text-xs rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white transition-smooth min-h-[36px]"
        >
          Analyze
        </button>
        {position.status === 'open' && (
          <button
            onClick={() => onClose(position)}
            className="px-3 py-1.5 text-xs rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth min-h-[36px]"
          >
            Close
          </button>
        )}
        <button
          onClick={() => onDelete(position.id)}
          className="px-3 py-1.5 text-xs rounded-md text-cerna-text-tertiary hover:text-cerna-loss transition-smooth ml-auto min-h-[36px]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
