'use client';

import { Search, Newspaper, LayoutDashboard } from 'lucide-react';
import type { RiskTolerance } from '@/types/portfolio';

interface StepReadyProps {
  displayName: string;
  risk: RiskTolerance;
  positionCount: number;
  onComplete: (destination: 'screen' | 'brief' | 'dashboard') => void;
  submitting: boolean;
}

export function StepReady({ displayName, risk, positionCount, onComplete, submitting }: StepReadyProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(124,91,240,0.15)] mb-3">
          <span className="text-2xl">✨</span>
        </div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">You&apos;re all set</h2>
        <p className="mt-1 text-cerna-text-secondary">Here&apos;s what we&apos;ve configured.</p>
      </div>

      <div className="glass rounded-xl p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-cerna-text-tertiary">Name</span>
          <span className="text-cerna-text-primary">{displayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-cerna-text-tertiary">Risk profile</span>
          <span className="text-cerna-text-primary capitalize">{risk}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-cerna-text-tertiary">Positions</span>
          <span className="text-cerna-text-primary">{positionCount}</span>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          disabled={submitting}
          onClick={() => onComplete('screen')}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[56px] disabled:opacity-50"
        >
          <Search size={20} />
          <span className="flex-1 text-left">Screen for opportunities</span>
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onComplete('brief')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-cerna-border text-cerna-text-primary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[56px] disabled:opacity-50"
        >
          <Newspaper size={20} />
          <span className="flex-1 text-left">Brief me on my holdings</span>
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => onComplete('dashboard')}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-cerna-border text-cerna-text-primary hover:border-cerna-primary hover:text-cerna-primary transition-smooth min-h-[56px] disabled:opacity-50"
        >
          <LayoutDashboard size={20} />
          <span className="flex-1 text-left">Explore the dashboard</span>
        </button>
      </div>
    </div>
  );
}
