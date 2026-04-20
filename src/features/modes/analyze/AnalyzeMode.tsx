'use client';

import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { ModeControls } from '@/types/chat';
import type { Position, WatchlistItem } from '@/types/portfolio';

interface AnalyzeModeProps {
  sessionId: string;
  initialTicker?: string;
  positions: Position[];
  watchlist: WatchlistItem[];
}

export function AnalyzeMode({ sessionId, initialTicker = '', positions, watchlist }: AnalyzeModeProps) {
  const [ticker, setTicker] = useState(initialTicker);
  const [analysisType, setAnalysisType] = useState<'thesis' | 'peers' | 'fundamentals'>('thesis');
  const [trigger, setTrigger] = useState(0);
  const [controls, setControls] = useState<ModeControls>({});
  const [message, setMessage] = useState<string | undefined>(undefined);

  const tickers = Array.from(
    new Set([...positions.map((p) => p.ticker), ...watchlist.map((w) => w.ticker)])
  );

  function run(overrideMessage?: string) {
    setControls({ ticker, analysisType });
    setMessage(overrideMessage);
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
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Analysis
          </label>
          <div className="flex rounded-full glass p-0.5">
            {(['thesis', 'peers', 'fundamentals'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAnalysisType(t)}
                className={`px-3 py-2 text-sm rounded-full capitalize transition-smooth min-h-[40px] ${
                  analysisType === t
                    ? 'bg-cerna-primary text-white'
                    : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                }`}
              >
                {t === 'thesis' ? 'Thesis' : t === 'peers' ? 'Peers' : 'Fundamentals'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => run()}
          disabled={!ticker}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Analyze
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={() => run('Analyze all my open positions and flag which thesis is weakening.')}
          className="px-4 py-2 text-sm rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px]"
        >
          Check all positions
        </button>
        <button
          onClick={() => run('Which of my positions has the weakest thesis today? Explain why.')}
          className="px-4 py-2 text-sm rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[44px]"
        >
          Weakest position
        </button>
      </div>

      {trigger === 0 ? (
        <EmptyState
          Icon={BarChart3}
          title="Analyze any position"
          description="Enter a ticker or select from your portfolio to get a thesis check."
        />
      ) : (
        <ChatStream
          mode="analyze"
          controls={controls}
          trigger={trigger}
          sessionId={sessionId}
          message={message}
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
