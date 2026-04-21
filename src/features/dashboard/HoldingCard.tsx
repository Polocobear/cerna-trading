'use client';

import { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Newspaper,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { HoldingData } from '@/lib/dashboard/use-dashboard-data';
import { cn } from '@/lib/utils/cn';
import { formatCurrencyDetailed, formatDate, formatPercent } from '@/lib/utils/format';

interface HoldingCardProps {
  holding: HoldingData;
  index: number;
  onAskAI: (ticker: string) => void;
}

function getRsiTone(signal: HoldingData['indicators']): string {
  if (!signal || signal.rsiSignal === 'neutral') return 'var(--indicator-neutral)';
  return signal.rsiSignal === 'oversold' ? 'var(--indicator-oversold)' : 'var(--indicator-overbought)';
}

function getEarningsTone(daysUntil: number | null): string {
  if (daysUntil == null) return 'var(--dashboard-text-50)';
  if (daysUntil <= 5) return 'var(--earnings-imminent)';
  if (daysUntil <= 14) return 'var(--earnings-soon)';
  return 'var(--earnings-later)';
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 animate-section-reveal">
      <div className="h-2 rounded-full shimmer" />
      <div className="h-2 rounded-full shimmer w-3/4" />
    </div>
  );
}

function AnalystBar({ holding }: { holding: HoldingData }) {
  const analyst = holding.analyst;
  if (!analyst) {
    return <div style={{ color: 'var(--dashboard-text-35)' }}>No analyst coverage</div>;
  }

  const buyCount = analyst.strongBuy + analyst.buy;
  const holdCount = analyst.hold;
  const sellCount = analyst.sell + analyst.strongSell;
  const total = analyst.totalAnalysts || 1;

  return (
    <div className="space-y-2 animate-section-reveal">
      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--dashboard-surface-08)' }}
      >
        <span style={{ width: `${(buyCount / total) * 100}%`, background: 'var(--analyst-buy)' }} />
        <span style={{ width: `${(holdCount / total) * 100}%`, background: 'var(--analyst-hold)' }} />
        <span style={{ width: `${(sellCount / total) * 100}%`, background: 'var(--analyst-sell)' }} />
      </div>
      <div className="text-sm" style={{ color: 'var(--dashboard-text-65)' }}>
        {`${buyCount} Buy | ${holdCount} Hold | ${sellCount} Sell`}
      </div>
      <div
        className="text-sm tabular-nums"
        style={{ color: analyst.upsidePct >= 0 ? 'var(--positive)' : 'var(--negative)' }}
      >
        {`Target: ${formatCurrencyDetailed(analyst.targetMeanPrice, holding.quote?.currency ?? 'AUD')} (${formatPercent(
          analyst.upsidePct,
          1
        )})`}
      </div>
    </div>
  );
}

function TechnicalGrid({ holding }: { holding: HoldingData }) {
  const indicators = holding.indicators;
  if (!indicators) {
    return <div style={{ color: 'var(--dashboard-text-35)' }}>No technical data</div>;
  }

  const trendUp = indicators.priceVsSma200 === 'above';
  const macdBullish = indicators.macdTrend === 'bullish';
  const macdBearish = indicators.macdTrend === 'bearish';
  const volumeHot = (indicators.volumeVsAvg ?? 0) > 1.5;

  return (
    <div className="grid gap-2 text-sm animate-section-reveal">
      <div className="flex flex-wrap gap-3">
        <span className="tabular-nums">
          RSI {indicators.rsi14 != null ? indicators.rsi14.toFixed(0) : 'N/A'}{' '}
          <span
            className="inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: getRsiTone(indicators) }}
          />{' '}
          <span style={{ color: getRsiTone(indicators) }}>
            {indicators.rsiSignal.charAt(0).toUpperCase() + indicators.rsiSignal.slice(1)}
          </span>
        </span>
        <span style={{ color: trendUp ? 'var(--positive)' : 'var(--negative)' }}>
          {trendUp ? <ArrowUpRight size={14} className="inline" /> : <ArrowDownRight size={14} className="inline" />}{' '}
          {trendUp ? 'Above 200-SMA' : 'Below 200-SMA'}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <span
          style={{
            color: macdBullish ? 'var(--positive)' : macdBearish ? 'var(--negative)' : 'var(--dashboard-text-50)',
          }}
        >
          {macdBullish ? <ArrowUpRight size={14} className="inline" /> : macdBearish ? <ArrowDownRight size={14} className="inline" /> : null}{' '}
          MACD {indicators.macdTrend ? indicators.macdTrend.charAt(0).toUpperCase() + indicators.macdTrend.slice(1) : 'Neutral'}
        </span>
        <span
          className="tabular-nums"
          style={{ color: volumeHot ? 'var(--warning)' : 'var(--dashboard-text-55)' }}
        >
          {`Vol ${indicators.volumeVsAvg != null ? `${indicators.volumeVsAvg.toFixed(1)}x avg` : 'N/A'}`}
        </span>
      </div>
    </div>
  );
}

export function HoldingCard({ holding, index, onAskAI }: HoldingCardProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const quote = holding.quote;
  const dailyPositive = (quote?.dailyChangePct ?? 0) >= 0;
  const pnlPositive = holding.unrealizedPnL >= 0;
  const showEarnings =
    holding.earnings?.earningsDate &&
    holding.earnings.daysUntilEarnings != null &&
    holding.earnings.daysUntilEarnings >= 0 &&
    holding.earnings.daysUntilEarnings <= 30;
  const topHeadline = holding.news[0];

  return (
    <article className="dashboard-card animate-card-in" style={{ animationDelay: `${index * 50}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold" style={{ color: 'var(--dashboard-text-strong)' }}>{holding.ticker}</h3>
            <span className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--dashboard-text-35)' }}>
              {holding.exchange}
            </span>
          </div>
          <div className="truncate text-sm" style={{ color: 'var(--dashboard-text-50)' }}>
            {holding.companyName}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div
            className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums"
            style={{ color: dailyPositive ? 'var(--positive)' : 'var(--negative)' }}
          >
            {dailyPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            <span>{formatPercent(quote?.dailyChangePct ?? 0, 1)}</span>
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: 'var(--dashboard-text-strong)' }}>
            {formatCurrencyDetailed(quote?.currentPrice ?? holding.avgCostPerShare, quote?.currency ?? 'AUD')}
          </div>
          <div className="text-xs tabular-nums" style={{ color: 'var(--dashboard-text-45)' }}>
            {formatCurrencyDetailed(holding.marketValue, quote?.currency ?? 'AUD')}
          </div>
        </div>
      </div>

      <div className="dashboard-card-divider" />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums" style={{ color: 'var(--dashboard-text-75)' }}>
          {`${holding.shares} shares`}
        </span>
        <span style={{ color: 'var(--dashboard-text-35)' }}>|</span>
        <span className="tabular-nums" style={{ color: 'var(--dashboard-text-75)' }}>
          {`Avg ${formatCurrencyDetailed(holding.avgCostPerShare, quote?.currency ?? 'AUD')}`}
        </span>
        <span style={{ color: 'var(--dashboard-text-35)' }}>|</span>
        <span
          className="tabular-nums font-medium"
          style={{ color: pnlPositive ? 'var(--positive)' : 'var(--negative)' }}
        >
          {`${pnlPositive ? '+' : '-'}${formatCurrencyDetailed(Math.abs(holding.unrealizedPnL), quote?.currency ?? 'AUD')} (${formatPercent(
            holding.unrealizedPnLPct,
            1
          )})`}
        </span>
        {holding.portfolioWeight > 20 && (
          <span className="dashboard-warning-badge tabular-nums">{`High wt ${holding.portfolioWeight.toFixed(0)}%`}</span>
        )}
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
          {holding.loading.analyst ? <SectionSkeleton /> : <AnalystBar holding={holding} />}
        </div>

        <div className="dashboard-card-divider" />
        <div className="space-y-2">
          <div className="dashboard-kicker">Technicals</div>
          {holding.loading.indicators ? <SectionSkeleton /> : <TechnicalGrid holding={holding} />}
        </div>

        {(showEarnings || topHeadline || holding.loading.earnings || holding.loading.news) && (
          <>
            <div className="dashboard-card-divider" />
            <div className="space-y-3">
              {holding.loading.earnings ? (
                <SectionSkeleton />
              ) : (
                showEarnings && (
                  <div
                    className="text-sm font-medium"
                    style={{
                      color: getEarningsTone(holding.earnings?.daysUntilEarnings ?? null),
                      animation:
                        (holding.earnings?.daysUntilEarnings ?? 100) <= 5 ? 'earnings-pulse 1.8s ease-in-out infinite' : undefined,
                    }}
                  >
                    {`Earnings ${formatDate(holding.earnings?.earningsDate ?? '')} (${holding.earnings?.daysUntilEarnings}d)`}
                  </div>
                )
              )}

              {holding.loading.news ? (
                <SectionSkeleton />
              ) : (
                topHeadline && (
                  <a
                    href={topHeadline.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-2 text-sm transition-smooth hover:opacity-90"
                    style={{ color: 'var(--dashboard-text-70)' }}
                  >
                    <Newspaper size={14} className="mt-0.5 shrink-0" />
                    <span className="truncate">{topHeadline.title}</span>
                  </a>
                )
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 hidden justify-end md:flex">
        <button type="button" onClick={() => onAskAI(holding.ticker)} className="dashboard-link-button">
          <span>Ask AI</span>
          <ArrowUpRight size={15} />
        </button>
      </div>

      <button type="button" onClick={() => onAskAI(holding.ticker)} className="dashboard-link-button mt-4 md:hidden w-full justify-center">
        <span>Ask AI</span>
        <ArrowUpRight size={15} />
      </button>
    </article>
  );
}
