'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface DraftPosition {
  ticker: string;
  shares: number;
  cost_basis: number;
  date_acquired?: string;
  thesis?: string;
}

interface StepPositionsProps {
  positions: DraftPosition[];
  onChange: (next: DraftPosition[]) => void;
  onNext: () => void;
  onSkip: () => void;
}

export function StepPositions({ positions, onChange, onNext, onSkip }: StepPositionsProps) {
  const [ticker, setTicker] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [dateAcquired, setDateAcquired] = useState('');
  const [thesis, setThesis] = useState('');

  function addPosition() {
    if (!ticker.trim() || !shares || !costBasis) return;
    onChange([
      ...positions,
      {
        ticker: ticker.trim().toUpperCase(),
        shares: Number(shares),
        cost_basis: Number(costBasis),
        date_acquired: dateAcquired || undefined,
        thesis: thesis.trim() || undefined,
      },
    ]);
    setTicker('');
    setShares('');
    setCostBasis('');
    setDateAcquired('');
    setThesis('');
  }

  function removeAt(i: number) {
    onChange(positions.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">Add your current holdings</h2>
        <p className="mt-1 text-cerna-text-secondary">
          We&apos;ll use these to personalize your analysis. You can always add more later.
        </p>
      </div>

      {positions.length > 0 && (
        <div className="space-y-2">
          {positions.map((p, i) => (
            <div
              key={`${p.ticker}-${i}`}
              className="flex items-center gap-3 p-3 rounded-lg glass"
            >
              <div className="flex-1">
                <div className="font-mono font-semibold text-cerna-text-primary">{p.ticker}</div>
                <div className="text-xs text-cerna-text-tertiary tabular-nums">
                  {p.shares} sh @ ${p.cost_basis}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="p-2 text-cerna-text-tertiary hover:text-cerna-loss transition-smooth"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none transition-smooth min-h-[44px] font-mono uppercase"
          />
          <input
            type="number"
            step="any"
            placeholder="Shares"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none transition-smooth min-h-[44px]"
          />
          <input
            type="number"
            step="any"
            placeholder="Cost basis"
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none transition-smooth min-h-[44px]"
          />
          <input
            type="date"
            value={dateAcquired}
            onChange={(e) => setDateAcquired(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none transition-smooth min-h-[44px]"
          />
        </div>
        <textarea
          rows={2}
          placeholder="Thesis (why are you holding this?)"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none transition-smooth"
        />
        <button
          type="button"
          onClick={addPosition}
          disabled={!ticker || !shares || !costBasis}
          className="w-full py-2 rounded-lg border border-cerna-border text-cerna-text-secondary hover:border-cerna-primary hover:text-cerna-primary transition-smooth disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          <Plus size={16} />
          Add another
        </button>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onNext}
          className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[48px]"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full py-2 text-sm text-cerna-text-tertiary hover:text-cerna-text-secondary transition-smooth"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
