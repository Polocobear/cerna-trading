'use client';

import { useState } from 'react';
import { Plug, SkipForward, Check } from 'lucide-react';
import { IBSetupWizard } from '@/features/portfolio/IBSetupWizard';

interface StepConnectBrokerProps {
  onDone: (connected: boolean) => void;
}

export function StepConnectBroker({ onDone }: StepConnectBrokerProps) {
  const [showWizard, setShowWizard] = useState(false);
  const [connected, setConnected] = useState(false);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-cerna-text-primary">
          Want to connect Interactive Brokers?
        </h2>
        <p className="mt-1 text-cerna-text-secondary">
          Skip the manual entry — Cerna can read your IB positions automatically each day.
        </p>
      </div>
      {connected && (
        <div className="flex items-center gap-2 text-sm text-cerna-profit bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-lg p-3">
          <Check size={16} />
          IB connected — you&apos;re all set.
        </div>
      )}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowWizard(true)}
          className="w-full flex items-center gap-3 p-4 rounded-xl bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth min-h-[56px]"
        >
          <Plug size={20} />
          <span className="flex-1 text-left">
            {connected ? 'Reconnect IB' : 'Connect Interactive Brokers'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onDone(connected)}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-cerna-border text-cerna-text-primary hover:border-cerna-primary transition-smooth min-h-[56px]"
        >
          <SkipForward size={20} />
          <span className="flex-1 text-left">
            {connected ? 'Continue' : 'Skip for now — I&rsquo;ll add positions manually'}
          </span>
        </button>
      </div>

      {showWizard && (
        <IBSetupWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => {
            setShowWizard(false);
            setConnected(true);
          }}
        />
      )}
    </div>
  );
}
