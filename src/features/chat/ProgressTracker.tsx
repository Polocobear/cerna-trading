'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ProgressTrackerProps {
  status: 'idle' | 'searching' | 'streaming' | 'done' | 'error';
}

const STEPS = [
  'Searching financials',
  'Analyzing fundamentals',
  'Comparing to portfolio',
  'Generating recommendations',
];

export function ProgressTracker({ status }: ProgressTrackerProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status === 'idle' || status === 'done' || status === 'error') {
      setStep(0);
      return;
    }
    const t = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 1500);
    return () => clearInterval(t);
  }, [status]);

  if (status === 'idle' || status === 'done' || status === 'error') return null;

  return (
    <div className="glass rounded-lg p-3 text-sm space-y-1.5 mt-3">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'active' : 'pending';
        return (
          <div key={label} className="flex items-center gap-2">
            {state === 'done' ? (
              <Check size={14} className="text-emerald-500 shrink-0" />
            ) : state === 'active' ? (
              <span className="w-2 h-2 rounded-full bg-cerna-primary animate-pulse shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-cerna-text-tertiary/50 shrink-0" />
            )}
            <span
              className={cn(
                state === 'done'
                  ? 'text-cerna-text-tertiary line-through'
                  : state === 'active'
                    ? 'text-cerna-text-primary'
                    : 'text-cerna-text-tertiary'
              )}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
