'use client';

import { cn } from '@/lib/utils/cn';

const EXCHANGES: Array<{ id: string; label: string; blurb: string }> = [
  { id: 'ASX', label: 'ASX', blurb: 'Australian Securities Exchange' },
  { id: 'NYSE', label: 'NYSE / NASDAQ', blurb: 'US markets' },
  { id: 'LSE', label: 'LSE', blurb: 'London Stock Exchange' },
  { id: 'TSX', label: 'TSX', blurb: 'Toronto Stock Exchange' },
  { id: 'OTHER', label: 'Other', blurb: 'Global / emerging markets' },
];

interface StepExchangeProps {
  selected: string[];
  onChange: (next: string[]) => void;
  onNext: () => void;
}

export function StepExchange({ selected, onChange, onNext }: StepExchangeProps) {
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">Where do you trade?</h2>
        <p className="mt-1 text-cerna-text-secondary">
          Pick one or more — this tunes news, screens, and analysis to your markets.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EXCHANGES.map((ex) => {
          const active = selected.includes(ex.id);
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => toggle(ex.id)}
              className={cn(
                'p-4 rounded-xl border-2 text-left transition-smooth',
                active
                  ? 'border-cerna-primary bg-[rgba(124,91,240,0.08)]'
                  : 'border-cerna-border bg-cerna-bg-primary hover:border-cerna-border-hover'
              )}
            >
              <div className="font-semibold text-cerna-text-primary">{ex.label}</div>
              <div className="text-xs text-cerna-text-tertiary mt-0.5">{ex.blurb}</div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={onNext}
        className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[48px] disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}
