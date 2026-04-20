'use client';

import { useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  TrendingUp,
  Target,
  Scale,
  Calculator,
  Zap,
  FileText,
} from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { AnalysisType, ChatMessage, ModeControls } from '@/types/chat';
import type { Position, WatchlistItem } from '@/types/portfolio';
import { useDeepRemaining } from '@/lib/gemini/use-deep-remaining';
import { cn } from '@/lib/utils/cn';

interface AnalyzeModeProps {
  sessionId: string;
  initialTicker?: string;
  positions: Position[];
  watchlist: WatchlistItem[];
  initialMessages?: ChatMessage[];
}

interface AnalysisCard {
  id: AnalysisType;
  label: string;
  Icon: typeof BarChart3;
  deep: boolean;
  needsTicker: boolean;
}

const CARDS: AnalysisCard[] = [
  { id: 'thesis', label: 'Thesis Check', Icon: ClipboardCheck, deep: false, needsTicker: true },
  { id: 'fundamentals', label: 'Full Fundamentals', Icon: BarChart3, deep: true, needsTicker: true },
  { id: 'technical', label: 'Technical Analysis', Icon: TrendingUp, deep: false, needsTicker: true },
  { id: 'analyst', label: 'Analyst Consensus', Icon: Target, deep: false, needsTicker: true },
  { id: 'peers', label: 'Peer Comparison', Icon: Scale, deep: true, needsTicker: true },
  { id: 'valuation', label: 'Valuation Model', Icon: Calculator, deep: true, needsTicker: true },
];

export function AnalyzeMode({
  sessionId,
  initialTicker = '',
  positions,
  watchlist,
  initialMessages = [],
}: AnalyzeModeProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('thesis');
  const [trigger, setTrigger] = useState(0);
  const [controls, setControls] = useState<ModeControls>({});
  const [message, setMessage] = useState<string | undefined>(undefined);
  const { remaining: deepRemaining } = useDeepRemaining();

  const tickers = Array.from(
    new Set([...positions.map((p) => p.ticker), ...watchlist.map((w) => w.ticker)])
  );

  const currentCard = CARDS.find((c) => c.id === analysisType);
  const showDeepBadge = currentCard?.deep && deepRemaining !== null;

  function run(overrideMessage?: string, typeOverride?: AnalysisType) {
    const type = typeOverride ?? analysisType;
    setControls({ ticker, analysisType: type });
    setMessage(overrideMessage);
    setTrigger((t) => t + 1);
  }

  function runPortfolioReport() {
    setAnalysisType('portfolio_report');
    setControls({ analysisType: 'portfolio_report' });
    setMessage('Generate a full portfolio health report across all my positions.');
    setTrigger((t) => t + 1);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Ticker
          </label>
          <input
            list="ticker-suggestions"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. BHP"
            className="w-full px-3 py-2.5 text-lg font-mono uppercase rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
          />
          <datalist id="ticker-suggestions">
            {tickers.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        <button
          onClick={() => run()}
          disabled={!ticker || analysisType === 'portfolio_report'}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analyze
        </button>
      </div>

      {/* Analysis type cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
        {CARDS.map(({ id, label, Icon, deep }) => {
          const active = analysisType === id;
          return (
            <button
              key={id}
              onClick={() => setAnalysisType(id)}
              className={cn(
                'relative flex items-start gap-2 p-3 rounded-lg text-left transition-smooth min-h-[60px]',
                active
                  ? 'glass border border-cerna-primary bg-[rgba(124,91,240,0.10)]'
                  : 'glass hover:border-cerna-border-hover'
              )}
            >
              <Icon size={16} className={active ? 'text-cerna-primary' : 'text-cerna-text-secondary'} strokeWidth={1.75} />
              <span className={cn('text-sm font-medium', active ? 'text-cerna-text-primary' : 'text-cerna-text-secondary')}>
                {label}
              </span>
              {deep && (
                <Zap
                  size={10}
                  className="absolute top-1.5 right-1.5 text-amber-400/70"
                  aria-label="deep tier"
                />
              )}
            </button>
          );
        })}
      </div>

      {showDeepBadge && (
        <div className="mt-2 text-xs flex items-center gap-1.5">
          {deepRemaining! > 0 ? (
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
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={() => run('Analyze all my open positions and flag which thesis is weakening.', 'thesis')}
          className="px-4 py-2 text-sm rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px]"
        >
          Check all positions
        </button>
        <button
          onClick={() => run('Which of my positions has the weakest thesis today? Explain why.', 'thesis')}
          className="px-4 py-2 text-sm rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px]"
        >
          Weakest position
        </button>
        <button
          onClick={runPortfolioReport}
          className="px-4 py-2 text-sm rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px] inline-flex items-center gap-1.5"
        >
          <FileText size={14} />
          Portfolio Report
          <Zap size={10} className="text-amber-400/70" />
        </button>
      </div>

      {trigger === 0 && initialMessages.length === 0 ? (
        <EmptyState
          Icon={BarChart3}
          title="Analyze any position"
          description="Enter a ticker and choose an analysis type — or run a Portfolio Report across everything."
        />
      ) : (
        <ChatStream
          mode="analyze"
          controls={controls}
          trigger={trigger}
          sessionId={sessionId}
          message={message}
          initialMessages={initialMessages}
          followUps={[
            'What would change my mind?',
            'Compare to sector peers',
            'What are the catalysts ahead?',
          ]}
        />
      )}
    </div>
  );
}
