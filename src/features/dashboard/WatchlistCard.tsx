'use client';

import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Newspaper,
} from 'lucide-react';
import type { WatchlistData } from '@/lib/dashboard/use-dashboard-data';
import { cn } from '@/lib/utils/cn';
import { formatCurrencyDetailed, formatPercent } from '@/lib/utils/format';

interface WatchlistCardProps {
  item: WatchlistData;
  index: number;
  onAskAI: (ticker: string) => void;
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 animate-section-reveal">
      <div className="h-2 rounded-full shimmer" />
      <div className="h-2 rounded-full shimmer w-2/3" />
    </div>
  );
}

function getTargetStatus(item: WatchlistData): { label: string; color: string } {
  const currentPrice = item.quote?.currentPrice ?? null;
  if (item.targetPrice == null || currentPrice == null) {
    return { label: 'Watching', color: 'var(--dashboard-text-50)' };
  }
  if (currentPrice <= item.targetPrice) {
    return { label: 'Target reached', color: 'var(--positive)' };
  }
  const gapPct = ((currentPrice - item.targetPrice) / item.targetPrice) * 100;
  if (gapPct <= 5) {
    return { label: 'Almost there', color: 'var(--warning)' };
  }
  return { label: 'Watching', color: 'var(--dashboard-text-50)' };
}

export function WatchlistCard({ item, index, onAskAI }: WatchlistCardProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const dailyPositive = (item.quote?.dailyChangePct ?? 0) >= 0;
  const status = getTargetStatus(item);
  const headline = item.news[0];

  return (
    <article className="dashboard-card animate-card-in" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" style={{ color: 'var(--dashboard-text-strong)' }}>{item.ticker}</h3>
            <span className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--dashboard-text-35)' }}>
              {item.exchange}
            </span>
          </div>
          <div className="truncate text-sm" style={{ color: 'var(--dashboard-text-50)' }}>
            {item.companyName}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div
            className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums"
            style={{ color: dailyPositive ? 'var(--positive)' : 'var(--negative)' }}
          >
            {dailyPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            <span>{formatPercent(item.quote?.dailyChangePct ?? 0, 1)}</span>
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: 'var(--dashboard-text-strong)' }}>
            {formatCurrencyDetailed(item.quote?.currentPrice ?? item.targetPrice ?? 0, item.quote?.currency ?? 'AUD')}
          </div>
        </div>
      </div>

      <div className="dashboard-card-divider" />

      <div className="space-y-1 text-sm">
        <div style={{ color: 'var(--dashboard-text-72)' }}>
          On watchlist
          {item.targetPrice != null && (
            <span className="tabular-nums">{` | Target ${formatCurrencyDetailed(item.targetPrice, item.quote?.currency ?? 'AUD')}`}</span>
          )}
        </div>
        <div className="tabular-nums" style={{ color: status.color }}>
          {item.distanceToTarget != null
            ? `Currently ${formatCurrencyDetailed(item.quote?.currentPrice ?? 0, item.quote?.currency ?? 'AUD')} - ${Math.abs(
                item.distanceToTarget
              ).toFixed(1)}% away | ${status.label}`
            : status.label}
        </div>
        {item.notes && <div style={{ color: 'var(--dashboard-text-45)' }}>{item.notes}</div>}
      </div>

      <button
        type="button"
        onClick={() => setMobileExpanded((current) => !current)}
        className="mt-3 flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm md:hidden"
        style={{ background: 'var(--dashboard-surface-04)', color: 'var(--dashboard-text-72)' }}
      >
        <span>Analyst, technicals, and news</span>
        {mobileExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <div className={cn('hidden md:block', mobileExpanded && 'block')}>
        <div className="dashboard-card-divider" />
        <div className="space-y-2">
          <div className="dashboard-kicker">Analysts</div>
          {item.loading.analyst ? (
            <SectionSkeleton />
          ) : item.analyst ? (
            <div className="space-y-2 animate-section-reveal">
              <div className="text-sm" style={{ color: 'var(--dashboard-text-65)' }}>
                {`${item.analyst.strongBuy + item.analyst.buy} Buy | ${item.analyst.hold} Hold | ${
                  item.analyst.sell + item.analyst.strongSell
                } Sell`}
              </div>
              <div
                className="text-sm tabular-nums"
                style={{ color: item.analyst.upsidePct >= 0 ? 'var(--positive)' : 'var(--negative)' }}
              >
                {`Target: ${formatCurrencyDetailed(item.analyst.targetMeanPrice, item.quote?.currency ?? 'AUD')} (${formatPercent(
                  item.analyst.upsidePct,
                  1
                )})`}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--dashboard-text-35)' }}>No analyst coverage</div>
          )}
        </div>

        <div className="dashboard-card-divider" />
        <div className="space-y-2">
          <div className="dashboard-kicker">Technicals</div>
          {item.loading.indicators ? (
            <SectionSkeleton />
          ) : item.indicators ? (
            <div className="space-y-2 animate-section-reveal text-sm">
              <div className="tabular-nums">
                {`RSI ${item.indicators.rsi14 != null ? item.indicators.rsi14.toFixed(0) : 'N/A'} | ${
                  item.indicators.priceVsSma200 === 'above' ? 'Above 200-SMA' : item.indicators.priceVsSma200 === 'below' ? 'Below 200-SMA' : 'Trend N/A'
                }`}
              </div>
              <div style={{ color: 'var(--dashboard-text-55)' }}>
                {`MACD ${item.indicators.macdTrend ?? 'neutral'} | Vol ${
                  item.indicators.volumeVsAvg != null ? `${item.indicators.volumeVsAvg.toFixed(1)}x avg` : 'N/A'
                }`}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--dashboard-text-35)' }}>No technical data</div>
          )}
        </div>

        {(item.loading.news || headline) && (
          <>
            <div className="dashboard-card-divider" />
            <div className="space-y-3">
              {item.loading.news ? (
                <SectionSkeleton />
              ) : (
                headline && (
                  <a
                    href={headline.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 text-sm transition-smooth hover:opacity-90"
                    style={{ color: 'var(--dashboard-text-70)' }}
                  >
                    <Newspaper size={14} className="mt-0.5 shrink-0" />
                    <span className="truncate">{headline.title}</span>
                  </a>
                )
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 hidden justify-end md:flex">
        <button type="button" onClick={() => onAskAI(item.ticker)} className="dashboard-link-button">
          <span>Ask AI</span>
          <ArrowUpRight size={15} />
        </button>
      </div>

      <button type="button" onClick={() => onAskAI(item.ticker)} className="dashboard-link-button mt-4 md:hidden w-full justify-center">
        <span>Ask AI</span>
        <ArrowUpRight size={15} />
      </button>
    </article>
  );
}
