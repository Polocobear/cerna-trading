'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Loader2,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type {
  TradeCheckState,
  TradeCheckStepId,
  TradeCheckStepState,
  TradeCheckVerdictResult,
} from '@/lib/agents/trade-check-types';

interface TradeChecklistProps {
  state: TradeCheckState;
}

const STEP_ORDER: TradeCheckStepId[] = [
  'screen',
  'fundamentals',
  'catalyst',
  'portfolio_fit',
  'verdict',
];

function statusAccent(step: TradeCheckStepState): string {
  switch (step.status) {
    case 'complete':
      return 'border-emerald-500/25 bg-emerald-500/10';
    case 'running':
      return 'border-[#7c5bf0]/30 bg-[#7c5bf0]/10';
    case 'error':
      return 'border-amber-500/30 bg-amber-500/10';
    case 'skipped':
      return 'border-white/10 bg-white/5';
    case 'awaiting_input':
      return 'border-sky-500/25 bg-sky-500/10';
    case 'idle':
    default:
      return 'border-white/8 bg-[rgba(255,255,255,0.03)]';
  }
}

function signalTone(result: TradeCheckStepState['result']): string {
  if (!result || !('signal' in result)) return 'text-[rgba(255,255,255,0.55)]';
  switch (result.signal) {
    case 'go':
      return 'text-emerald-300';
    case 'stop':
      return 'text-amber-300';
    case 'caution':
    default:
      return 'text-[#d7caff]';
  }
}

function StepIcon({ step }: { step: TradeCheckStepState }) {
  if (step.status === 'complete') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
        <Check size={14} />
      </div>
    );
  }
  if (step.status === 'running') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#7c5bf0]/15 text-[#9d85f5]">
        <Loader2 size={14} className="animate-spin" />
      </div>
    );
  }
  if (step.status === 'error') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
        <AlertTriangle size={14} />
      </div>
    );
  }
  if (step.status === 'skipped') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-white/55">
        <Minus size={14} />
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 text-white/35">
      <Circle size={12} />
    </div>
  );
}

function VerdictBanner({ result }: { result: TradeCheckVerdictResult }) {
  const tone =
    result.verdict === 'GO'
      ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100'
      : result.verdict === 'NO_GO'
        ? 'border-amber-500/35 bg-amber-500/12 text-amber-100'
        : 'border-[#7c5bf0]/35 bg-[#7c5bf0]/12 text-[#ece7ff]';

  return (
    <div className={cn('rounded-2xl border px-4 py-4', tone)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
        Final verdict
      </div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{result.verdict}</div>
          <div className="mt-1 text-sm leading-6 text-white/85">{result.headline}</div>
        </div>
        <div className="shrink-0 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-white/70">
          {result.conviction}
        </div>
      </div>
      <div className="mt-3 text-sm leading-6 text-white/85">{result.summary}</div>
    </div>
  );
}

export function TradeChecklist({ state }: TradeChecklistProps) {
  const [expanded, setExpanded] = useState<TradeCheckStepId | null>('screen');

  const verdict = useMemo(() => {
    const result = state.steps.verdict.result;
    return result && 'verdict' in result ? (result as TradeCheckVerdictResult) : null;
  }, [state.steps.verdict.result]);

  return (
    <div
      className="rounded-[24px] border px-4 py-4"
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))',
        borderColor: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[rgba(255,255,255,0.42)]">
            Trade checklist
          </div>
          <div className="mt-1 text-lg font-semibold text-cerna-text-primary">{state.ticker}</div>
          <div className="mt-1 text-sm text-[rgba(255,255,255,0.55)]">
            Requested action: {state.requestedAction.replace('_', ' ')}
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[rgba(255,255,255,0.55)]">
          {state.active ? 'In progress' : 'Complete'}
        </div>
      </div>

      {verdict && (
        <div className="mt-4">
          <VerdictBanner result={verdict} />
        </div>
      )}

      <div className="mt-5 space-y-3">
        {STEP_ORDER.map((stepId, index) => {
          const step = state.steps[stepId];
          const isExpanded = expanded === stepId;
          const canExpand = Boolean(step.result || step.error || step.gateMessage || step.stage);
          const headline =
            step.result && 'headline' in step.result ? step.result.headline : step.error ?? step.stage ?? null;

          return (
            <div key={stepId} className="relative">
              {index < STEP_ORDER.length - 1 && (
                <div className="absolute left-[13px] top-8 h-[calc(100%+0.75rem)] w-px bg-white/8" />
              )}

              <div className={cn('rounded-2xl border p-3 transition-colors', statusAccent(step))}>
                <button
                  type="button"
                  disabled={!canExpand}
                  onClick={() => setExpanded((prev) => (prev === stepId ? null : stepId))}
                  className={cn(
                    'flex w-full items-start gap-3 text-left',
                    !canExpand && 'cursor-default'
                  )}
                >
                  <StepIcon step={step} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-cerna-text-primary">{step.title}</div>
                        <div className="mt-1 text-xs text-[rgba(255,255,255,0.42)]">
                          {headline ?? (step.status === 'idle' ? 'Waiting to run' : step.status)}
                        </div>
                      </div>
                      {step.result && 'signal' in step.result && (
                        <span className={cn('shrink-0 text-[11px] font-medium uppercase tracking-[0.14em]', signalTone(step.result))}>
                          {step.result.signal}
                        </span>
                      )}
                      {canExpand && (
                        <ChevronDown
                          size={16}
                          className={cn(
                            'shrink-0 text-[rgba(255,255,255,0.4)] transition-transform',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      )}
                    </div>
                  </div>
                </button>

                {isExpanded && canExpand && (
                  <div className="ml-10 mt-3 border-t border-white/8 pt-3 text-sm leading-6 text-[rgba(255,255,255,0.8)]">
                    {step.result && 'summary' in step.result && (
                      <p>{step.result.summary}</p>
                    )}
                    {step.result && 'keyPoints' in step.result && step.result.keyPoints.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(255,255,255,0.38)]">
                          Highlights
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {step.result.keyPoints.slice(0, 4).map((point) => (
                            <li key={point} className="flex gap-2">
                              <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#7c5bf0]/70" />
                              <span>{point}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {step.result && 'riskFlags' in step.result && step.result.riskFlags.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[rgba(255,255,255,0.38)]">
                          Risks
                        </div>
                        <ul className="mt-2 space-y-1.5">
                          {step.result.riskFlags.slice(0, 3).map((risk) => (
                            <li key={risk} className="flex gap-2">
                              <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/75" />
                              <span>{risk}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {step.stage && step.status === 'running' && (
                      <p className="mt-3 text-[12px] text-[rgba(255,255,255,0.45)]">{step.stage}</p>
                    )}
                    {step.gateMessage && (
                      <div className="mt-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2.5 text-[13px] leading-6 text-[rgba(255,255,255,0.72)]">
                        {step.gateMessage}
                      </div>
                    )}
                    {step.error && (
                      <p className="mt-3 text-sm text-amber-200/85">{step.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {state.active && (
        <div className="mt-4 rounded-2xl border border-white/8 bg-black/10 px-3.5 py-3 text-sm leading-6 text-[rgba(255,255,255,0.72)]">
          {state.currentStep === 'portfolio_fit'
            ? 'Waiting for your call: continue, resize, challenge, or stop.'
            : 'Waiting for your call: continue, challenge, skip, ask a question, or stop.'}
        </div>
      )}
    </div>
  );
}
