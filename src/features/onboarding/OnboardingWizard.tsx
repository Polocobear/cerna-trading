'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { RiskTolerance } from '@/types/portfolio';
import { createClient } from '@/lib/supabase/client';
import { StepProfile } from './StepProfile';
import { StepRisk } from './StepRisk';
import { StepExchange } from './StepExchange';
import { StepConnectBroker } from './StepConnectBroker';
import { StepPositions, type DraftPosition } from './StepPositions';
import { StepReady } from './StepReady';

interface OnboardingWizardProps {
  userId: string;
  initialDisplayName?: string;
}

export function OnboardingWizard({ userId, initialDisplayName = '' }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [smsfName, setSmsfName] = useState('');
  const [strategy, setStrategy] = useState('');
  const [risk, setRisk] = useState<RiskTolerance>('moderate');
  const [sectors, setSectors] = useState<string[]>([]);
  const [exchanges, setExchanges] = useState<string[]>([]);
  const [ibConnected, setIbConnected] = useState(false);
  const [positions, setPositions] = useState<DraftPosition[]>([]);

  const totalSteps = 6;

  async function complete(destination: 'screen' | 'brief' | 'dashboard') {
    setSubmitting(true);
    setError(null);
    try {
      const supabase = createClient();
      const primaryExchange = exchanges[0] ?? 'ASX';
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({
          display_name: displayName,
          smsf_name: smsfName || null,
          investment_strategy: strategy,
          risk_tolerance: risk,
          sectors_of_interest: sectors.length > 0 ? sectors : null,
          preferred_exchange: exchanges.length > 0 ? exchanges.join(',') : primaryExchange,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (profileErr) throw profileErr;

      if (!ibConnected && positions.length > 0) {
        const rows = positions.map((p) => ({
          user_id: userId,
          ticker: p.ticker,
          shares: p.shares,
          cost_basis: p.cost_basis,
          date_acquired: p.date_acquired ?? null,
          thesis: p.thesis ?? null,
          exchange: primaryExchange,
        }));
        const { error: posErr } = await supabase.from('positions').insert(rows);
        if (posErr) throw posErr;
      }

      const url =
        destination === 'dashboard' ? '/dashboard' : `/dashboard?mode=${destination}`;
      router.push(url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
      setSubmitting(false);
    }
  }

  const progressPct = (step / totalSteps) * 100;

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(124, 91, 240, 0.08) 0%, transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-[560px]">
        <div className="mb-4 flex items-center gap-3">
          {step > 1 && step < totalSteps && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="p-2 -ml-2 text-cerna-text-tertiary hover:text-cerna-text-primary transition-smooth"
              aria-label="Back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex-1 h-1 rounded-full bg-cerna-bg-tertiary overflow-hidden">
            <div
              className="h-full bg-cerna-primary transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-cerna-text-tertiary tabular-nums">
            {step}/{totalSteps}
          </span>
        </div>

        <div className="rounded-2xl glass-elevated p-6 md:p-8">
          {step === 1 && (
            <StepProfile
              displayName={displayName}
              smsfName={smsfName}
              strategy={strategy}
              onChange={(next) => {
                setDisplayName(next.displayName);
                setSmsfName(next.smsfName);
                setStrategy(next.strategy);
              }}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <StepRisk
              risk={risk}
              sectors={sectors}
              onChange={(next) => {
                setRisk(next.risk);
                setSectors(next.sectors);
              }}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepExchange
              selected={exchanges}
              onChange={setExchanges}
              onNext={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <StepConnectBroker
              onDone={(connected) => {
                setIbConnected(connected);
                setStep(connected ? 6 : 5);
              }}
            />
          )}
          {step === 5 && (
            <StepPositions
              positions={positions}
              onChange={setPositions}
              onNext={() => setStep(6)}
              onSkip={() => {
                setPositions([]);
                setStep(6);
              }}
            />
          )}
          {step === 6 && (
            <StepReady
              displayName={displayName}
              risk={risk}
              positionCount={ibConnected ? -1 : positions.length}
              onComplete={complete}
              submitting={submitting}
            />
          )}
          {error && (
            <p className="mt-4 text-sm text-cerna-loss bg-[rgba(239,68,68,0.1)] p-2.5 rounded-md">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
