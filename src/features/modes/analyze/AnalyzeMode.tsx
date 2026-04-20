'use client';

import { useState } from 'react';
import { ChatStream } from '@/features/chat/ChatStream';
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
      <div className="flex flex-wrap items-end gap-3 p-4 bg-cerna-bg-secondary rounded-xl border border-cerna-border">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Ticker
          </label>
          <input
            list="ticker-suggestions"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. BHP"
            className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
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
          <div className="flex rounded-md border border-cerna-border overflow-hidden">
            {(['thesis', 'peers', 'fundamentals'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAnalysisType(t)}
                className={`px-3 py-2 text-sm capitalize ${analysisType === t ? 'bg-cerna-primary text-white' : 'bg-cerna-bg-tertiary text-cerna-text-secondary'}`}
              >
                {t === 'thesis' ? 'Thesis check' : t === 'peers' ? 'Peers' : 'Fundamentals'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => run()}
          disabled={!ticker}
          className="px-5 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition disabled:opacity-50"
        >
          Analyze
        </button>
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => run('Analyze all my open positions and flag which thesis is weakening.')}
          className="px-3 py-1.5 text-sm rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-secondary hover:text-cerna-text-primary hover:border-cerna-border-active transition"
        >
          Check all positions
        </button>
        <button
          onClick={() => run('Which of my positions has the weakest thesis today? Explain why.')}
          className="px-3 py-1.5 text-sm rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-secondary hover:text-cerna-text-primary hover:border-cerna-border-active transition"
        >
          Weakest position
        </button>
      </div>

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
    </div>
  );
}
