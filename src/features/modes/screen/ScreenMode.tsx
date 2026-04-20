'use client';

import { useState } from 'react';
import { Search, Zap, ChevronDown, ChevronUp, X } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { ChatMessage, ModeControls, ScreenStrategy } from '@/types/chat';
import { useDeepRemaining } from '@/lib/gemini/use-deep-remaining';
import { STRATEGY_PRESETS, STRATEGY_LABELS, STRATEGY_DESCRIPTIONS } from './strategy-presets';
import { cn } from '@/lib/utils/cn';

const SECTORS = [
  'All',
  'Mining & Resources',
  'Banking & Finance',
  'Technology',
  'Healthcare',
  'Energy',
  'Consumer Staples',
  'Consumer Discretionary',
  'REITs & Property',
  'Industrials',
  'Telecommunications',
  'Utilities',
  'Materials',
];

const CAPS = [
  'All',
  'Mega ($50B+)',
  'Large ($10-50B)',
  'Mid ($2-10B)',
  'Small ($500M-2B)',
  'Micro ($100-500M)',
];

const STRATEGY_OPTIONS: ScreenStrategy[] = [
  'value',
  'growth',
  'dividend',
  'quality',
  'momentum',
  'turnaround',
];

type NumberKeys =
  | 'maxPE'
  | 'maxPB'
  | 'maxPEG'
  | 'minEPSGrowth'
  | 'minRevenueGrowth'
  | 'minDividendYield'
  | 'maxPayoutRatio'
  | 'maxDebtEquity'
  | 'minROE'
  | 'minPriceTargetUpside';

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      step="any"
      inputMode="decimal"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === '' ? undefined : Number(v));
      }}
      className="w-24 px-2 py-1.5 text-right tabular-nums rounded-md bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth"
    />
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-[18px] h-[18px] rounded accent-cerna-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium uppercase tracking-wider text-cerna-text-tertiary mb-2">
      {children}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-sm text-cerna-text-secondary">{label}</span>
      {children}
    </div>
  );
}

export function ScreenMode({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages?: ChatMessage[];
}) {
  const [controls, setControls] = useState<ModeControls>({
    sector: 'All',
    marketCap: 'All',
    strategy: 'value',
    depth: 'quick',
    ...STRATEGY_PRESETS.value,
  });
  const [expanded, setExpanded] = useState(false);
  const [trigger, setTrigger] = useState(0);
  const [submitted, setSubmitted] = useState<ModeControls>({});
  const { remaining: deepRemaining } = useDeepRemaining();

  function update<K extends keyof ModeControls>(key: K, value: ModeControls[K]) {
    setControls((c) => {
      const next = { ...c, [key]: value };
      // Any manual change to a preset-controlled field flips strategy to "custom"
      const presetKeys: (keyof ModeControls)[] = [
        'maxPE',
        'maxPB',
        'maxPEG',
        'minEPSGrowth',
        'minRevenueGrowth',
        'minDividendYield',
        'maxPayoutRatio',
        'maxDebtEquity',
        'minROE',
        'positiveFCF',
        'minAnalystConsensus',
        'minPriceTargetUpside',
        'above200MA',
        'above50MA',
        'rsiRange',
      ];
      if (presetKeys.includes(key) && c.strategy !== 'custom') {
        next.strategy = 'custom';
      }
      return next;
    });
  }

  function selectStrategy(strategy: ScreenStrategy) {
    if (strategy === 'custom') {
      setControls((c) => ({
        sector: c.sector,
        marketCap: c.marketCap,
        strategy: 'custom',
        depth: c.depth,
      }));
      return;
    }
    setControls((c) => ({
      sector: c.sector,
      marketCap: c.marketCap,
      strategy,
      depth: c.depth,
      ...STRATEGY_PRESETS[strategy],
    }));
  }

  function resetFilters() {
    if (controls.strategy && controls.strategy !== 'custom') {
      selectStrategy(controls.strategy);
    } else {
      setControls((c) => ({
        sector: c.sector,
        marketCap: c.marketCap,
        strategy: 'custom',
        depth: c.depth,
      }));
    }
  }

  function run() {
    setSubmitted(controls);
    setTrigger((t) => t + 1);
  }

  const numberField = (key: NumberKeys, placeholder?: string) => (
    <NumberInput
      value={controls[key] as number | undefined}
      onChange={(v) => update(key, v)}
      placeholder={placeholder}
    />
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="glass rounded-xl p-4 space-y-4">
        {/* Quick filters */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Sector
            </label>
            <select
              value={controls.sector ?? 'All'}
              onChange={(e) => update('sector', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
            >
              {SECTORS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Market cap
            </label>
            <select
              value={controls.marketCap ?? 'All'}
              onChange={(e) => update('marketCap', e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
            >
              {CAPS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Strategy
            </label>
            <select
              value={controls.strategy ?? 'value'}
              onChange={(e) => selectStrategy(e.target.value as ScreenStrategy)}
              className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
              title={
                controls.strategy && controls.strategy !== 'custom'
                  ? STRATEGY_DESCRIPTIONS[controls.strategy]
                  : undefined
              }
            >
              {STRATEGY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABELS[s]}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Depth
            </label>
            <div className="flex rounded-full glass p-0.5">
              {(['quick', 'deep'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => update('depth', d)}
                  className={cn(
                    'px-4 py-2 text-sm rounded-full capitalize transition-smooth min-h-[40px]',
                    controls.depth === d
                      ? 'bg-cerna-primary text-white'
                      : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={run}
            className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px] flex items-center justify-center gap-2"
          >
            <Search size={16} />
            Screen ASX
          </button>
        </div>

        {/* Strategy badge + deep indicator */}
        <div className="flex flex-wrap items-center gap-2">
          {controls.strategy && controls.strategy !== 'custom' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(124,91,240,0.15)] text-cerna-primary text-xs font-medium">
              {STRATEGY_LABELS[controls.strategy]} Strategy
              <button
                type="button"
                onClick={() => selectStrategy('custom')}
                className="hover:text-cerna-text-primary transition-smooth"
                aria-label="Clear strategy"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {controls.depth === 'deep' && deepRemaining !== null && (
            <span className="inline-flex items-center gap-1.5 text-xs">
              {deepRemaining > 0 ? (
                <>
                  <Zap size={12} className="text-amber-400/70" />
                  <span className="text-amber-400/70">
                    Uses deep analysis ({deepRemaining} remaining today)
                  </span>
                </>
              ) : (
                <span className="text-cerna-text-tertiary">
                  Deep analysis limit reached — using standard model
                </span>
              )}
            </span>
          )}
        </div>

        {/* Advanced filters toggle */}
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="inline-flex items-center gap-1 text-sm text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide' : 'Advanced'} Filters
        </button>

        {expanded && (
          <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 pt-2 border-t border-cerna-border">
            <div>
              <SectionHeader>Valuation</SectionHeader>
              <FilterRow label="Max P/E">{numberField('maxPE')}</FilterRow>
              <FilterRow label="Max P/B">{numberField('maxPB')}</FilterRow>
              <FilterRow label="Max PEG">{numberField('maxPEG')}</FilterRow>
            </div>
            <div>
              <SectionHeader>Growth</SectionHeader>
              <FilterRow label="Min EPS growth %">{numberField('minEPSGrowth')}</FilterRow>
              <FilterRow label="Min revenue growth %">{numberField('minRevenueGrowth')}</FilterRow>
            </div>
            <div>
              <SectionHeader>Income</SectionHeader>
              <FilterRow label="Min dividend yield %">{numberField('minDividendYield')}</FilterRow>
              <FilterRow label="Max payout ratio %">{numberField('maxPayoutRatio')}</FilterRow>
            </div>
            <div>
              <SectionHeader>Financial health</SectionHeader>
              <FilterRow label="Max debt / equity">{numberField('maxDebtEquity')}</FilterRow>
              <FilterRow label="Min ROE %">{numberField('minROE')}</FilterRow>
              <div className="pt-1">
                <Checkbox
                  checked={controls.positiveFCF}
                  onChange={(v) => update('positiveFCF', v)}
                  label="Positive free cash flow"
                />
              </div>
            </div>
            <div>
              <SectionHeader>Analyst sentiment</SectionHeader>
              <FilterRow label="Min consensus">
                <select
                  value={controls.minAnalystConsensus ?? 'any'}
                  onChange={(e) =>
                    update('minAnalystConsensus', e.target.value as ModeControls['minAnalystConsensus'])
                  }
                  className="px-2 py-1.5 rounded-md bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary text-sm focus:border-cerna-border-active focus:outline-none transition-smooth"
                >
                  <option value="any">Any</option>
                  <option value="strong_buy">Strong Buy</option>
                  <option value="buy">Buy</option>
                  <option value="hold">Hold</option>
                </select>
              </FilterRow>
              <FilterRow label="Min price target upside %">{numberField('minPriceTargetUpside')}</FilterRow>
            </div>
            <div>
              <SectionHeader>Technical</SectionHeader>
              <div className="py-1">
                <Checkbox
                  checked={controls.above200MA}
                  onChange={(v) => update('above200MA', v)}
                  label="Above 200-day MA"
                />
              </div>
              <div className="py-1">
                <Checkbox
                  checked={controls.above50MA}
                  onChange={(v) => update('above50MA', v)}
                  label="Above 50-day MA"
                />
              </div>
              <FilterRow label="RSI range">
                <select
                  value={controls.rsiRange ?? 'any'}
                  onChange={(e) => update('rsiRange', e.target.value as ModeControls['rsiRange'])}
                  className="px-2 py-1.5 rounded-md bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary text-sm focus:border-cerna-border-active focus:outline-none transition-smooth"
                >
                  <option value="any">Any</option>
                  <option value="oversold">Oversold (&lt;30)</option>
                  <option value="neutral">Neutral (30-70)</option>
                  <option value="overbought">Overbought (&gt;70)</option>
                </select>
              </FilterRow>
            </div>
            <div className="md:col-span-2 lg:col-span-3 flex justify-end pt-2">
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm text-cerna-text-tertiary hover:text-cerna-text-primary transition-smooth"
              >
                Reset to strategy defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {trigger === 0 && initialMessages.length === 0 ? (
        <EmptyState
          Icon={Search}
          title="Screen the ASX for opportunities"
          description="Pick a strategy, tune the filters, and let Cerna find stocks that match."
        />
      ) : (
        <ChatStream
          mode="screen"
          controls={submitted}
          trigger={trigger}
          sessionId={sessionId}
          initialMessages={initialMessages}
          followUps={[
            'Show cheapest one in detail',
            'Compare to my current holdings',
            'Which has the best analyst momentum?',
          ]}
        />
      )}
    </div>
  );
}
