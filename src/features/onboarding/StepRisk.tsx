'use client';

import { Shield, Scale, Flame } from 'lucide-react';
import type { RiskTolerance } from '@/types/portfolio';
import { cn } from '@/lib/utils/cn';

const RISK_OPTIONS: Array<{
  id: RiskTolerance;
  title: string;
  description: string;
  Icon: typeof Shield;
  tint: string;
}> = [
  {
    id: 'conservative',
    title: 'Conservative',
    description: 'Capital preservation first. Blue chips, dividends, low volatility.',
    Icon: Shield,
    tint: 'border-emerald-500/50 bg-emerald-500/5',
  },
  {
    id: 'moderate',
    title: 'Moderate',
    description: 'Balanced growth and income. Mix of blue chips and mid-caps.',
    Icon: Scale,
    tint: 'border-blue-500/50 bg-blue-500/5',
  },
  {
    id: 'aggressive',
    title: 'Aggressive',
    description: 'Growth-focused. Willing to accept higher volatility for higher returns.',
    Icon: Flame,
    tint: 'border-amber-500/50 bg-amber-500/5',
  },
];

const SECTORS = ['Mining', 'Banking', 'Tech', 'Healthcare', 'Energy', 'Consumer', 'REIT', 'Infrastructure'];

interface StepRiskProps {
  risk: RiskTolerance;
  sectors: string[];
  onChange: (next: { risk: RiskTolerance; sectors: string[] }) => void;
  onNext: () => void;
}

export function StepRisk({ risk, sectors, onChange, onNext }: StepRiskProps) {
  function toggleSector(s: string) {
    const next = sectors.includes(s) ? sectors.filter((x) => x !== s) : [...sectors, s];
    onChange({ risk, sectors: next });
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">How do you invest?</h2>
        <p className="mt-1 text-cerna-text-secondary">Pick the profile that best describes your approach.</p>
      </div>

      <div className="space-y-3">
        {RISK_OPTIONS.map((opt) => {
          const selected = risk === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange({ risk: opt.id, sectors })}
              className={cn(
                'w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-smooth',
                selected
                  ? opt.tint
                  : 'border-cerna-border bg-cerna-bg-primary hover:border-cerna-border-hover'
              )}
            >
              <opt.Icon size={24} className="shrink-0 mt-0.5 text-cerna-text-primary" strokeWidth={1.5} />
              <div>
                <div className="font-semibold text-cerna-text-primary">{opt.title}</div>
                <div className="text-sm text-cerna-text-secondary mt-0.5">{opt.description}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <label className="block text-sm font-medium text-cerna-text-secondary mb-2">
          Sectors of interest
        </label>
        <div className="flex flex-wrap gap-2">
          {SECTORS.map((s) => {
            const selected = sectors.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSector(s)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm transition-smooth min-h-[36px]',
                  selected
                    ? 'bg-[rgba(124,91,240,0.15)] border border-cerna-primary text-cerna-primary'
                    : 'bg-cerna-bg-primary border border-cerna-border text-cerna-text-secondary hover:border-cerna-border-hover'
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[48px]"
      >
        Continue
      </button>
    </div>
  );
}
