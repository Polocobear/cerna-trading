'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  Shield,
  FileText,
  Key,
  Check,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ExternalLink,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface IBSetupWizardProps {
  onClose: () => void;
  onComplete: () => void;
}

interface SyncSummary {
  positionsAdded: number;
  positionsUpdated: number;
  cashUpdated: boolean;
}

type TestState =
  | { status: 'idle' }
  | { status: 'testing' }
  | { status: 'ok'; positions: number }
  | { status: 'error'; message: string };

export function IBSetupWizard({ onClose, onComplete }: IBSetupWizardProps) {
  const [step, setStep] = useState(1);
  const [flexToken, setFlexToken] = useState('');
  const [activityQueryId, setActivityQueryId] = useState('');
  const [tradeConfirmQueryId, setTradeConfirmQueryId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalSteps = 5;
  const progressPct = (step / totalSteps) * 100;

  async function runTest() {
    if (!flexToken.trim() || !activityQueryId.trim()) return;
    setTest({ status: 'testing' });
    try {
      // Save path also tests — we'll tentatively call save in a dry-run manner.
      // For the real test we POST to /api/portfolio/ib-connection and parse failure vs success.
      const res = await fetch('/api/portfolio/ib-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flex_token: flexToken.trim(),
          activity_query_id: activityQueryId.trim(),
          trade_confirm_query_id: tradeConfirmQueryId.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        test?: { positions: number };
        sync?: SyncSummary;
      };
      if (!res.ok || data.error) {
        setTest({ status: 'error', message: data.error ?? 'Connection test failed' });
      } else {
        setTest({ status: 'ok', positions: data.test?.positions ?? 0 });
        if (data.sync) setSummary(data.sync);
      }
    } catch (err) {
      setTest({
        status: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  async function saveAndSync() {
    setSaving(true);
    setSaveError(null);
    try {
      // Already saved on successful test. If summary empty, trigger a manual sync.
      if (!summary) {
        const res = await fetch('/api/portfolio/sync', { method: 'POST' });
        if (res.ok) {
          const data = (await res.json()) as {
            activity?: SyncSummary;
          };
          if (data.activity) setSummary(data.activity);
        }
      }
      setStep(5);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-[640px] max-h-[90vh] overflow-y-auto custom-scrollbar rounded-2xl glass-elevated p-6 md:p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-cerna-text-tertiary hover:text-cerna-text-primary transition"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <div className="mb-5 flex items-center gap-3">
          {step > 1 && step < 5 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="p-2 -ml-2 text-cerna-text-tertiary hover:text-cerna-text-primary"
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

        {step === 1 && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(124,91,240,0.15)] mx-auto">
              <Shield size={28} className="text-cerna-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-cerna-text-primary">Connect your IB account</h2>
              <p className="mt-2 text-cerna-text-secondary">
                Cerna can read your Interactive Brokers positions daily so you never have to enter
                trades manually. We only read — Cerna can never place trades on your behalf.
              </p>
            </div>
            <ul className="space-y-2 text-sm text-cerna-text-secondary">
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 text-cerna-profit shrink-0" />
                Read-only access via IB Flex Web Service
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 text-cerna-profit shrink-0" />
                Daily auto-sync after market close
              </li>
              <li className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 text-cerna-profit shrink-0" />
                Your token stays encrypted in your account
              </li>
            </ul>
            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[48px]"
            >
              Get started
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <FileText size={22} className="text-cerna-primary" />
              <h2 className="text-xl font-bold text-cerna-text-primary">Create an Activity Flex Query</h2>
            </div>
            <ol className="space-y-3 text-sm text-cerna-text-secondary list-decimal list-inside">
              <li>
                Log in to{' '}
                <a
                  href="https://www.interactivebrokers.com/portal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cerna-primary hover:underline inline-flex items-center gap-1"
                >
                  IB Account Management
                  <ExternalLink size={12} />
                </a>
              </li>
              <li>Navigate to <span className="text-cerna-text-primary">Performance &amp; Reports → Flex Queries</span></li>
              <li>Click <span className="text-cerna-text-primary">+ New Activity Flex Query</span></li>
              <li>Set the period to <span className="text-cerna-text-primary">Last Business Day</span></li>
              <li>Include sections: <span className="text-cerna-text-primary">Open Positions (all)</span> and <span className="text-cerna-text-primary">Cash Report (all)</span></li>
              <li>Save and note the <span className="text-cerna-text-primary">Query ID</span></li>
            </ol>
            <p className="text-xs text-cerna-text-tertiary">
              Optional: also create a <span className="text-cerna-text-secondary">Trade Confirmation Flex Query</span> to
              reconcile executed trades within hours.
            </p>
            <button
              onClick={() => setStep(3)}
              className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[48px]"
            >
              Got it
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <Key size={22} className="text-cerna-primary" />
              <h2 className="text-xl font-bold text-cerna-text-primary">Generate a Flex token</h2>
            </div>
            <ol className="space-y-3 text-sm text-cerna-text-secondary list-decimal list-inside">
              <li>
                In Account Management, go to{' '}
                <span className="text-cerna-text-primary">Settings → Account Settings → Flex Web Service</span>
              </li>
              <li>Enable the Flex Web Service</li>
              <li>Click <span className="text-cerna-text-primary">Generate Token</span></li>
              <li>Set expiry to <span className="text-cerna-text-primary">1 year</span> (you can regenerate any time)</li>
              <li>Copy the token string</li>
            </ol>
            <button
              onClick={() => setStep(4)}
              className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[48px]"
            >
              I have my token
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="text-xl font-bold text-cerna-text-primary">Enter your credentials</h2>

            <div>
              <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">
                Flex Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={flexToken}
                  onChange={(e) => {
                    setFlexToken(e.target.value);
                    setTest({ status: 'idle' });
                  }}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
                  placeholder="Paste your Flex token"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-cerna-text-tertiary hover:text-cerna-text-primary"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">
                Activity Query ID
              </label>
              <input
                value={activityQueryId}
                onChange={(e) => {
                  setActivityQueryId(e.target.value);
                  setTest({ status: 'idle' });
                }}
                className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
                placeholder="e.g. 1234567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-cerna-text-secondary mb-1.5">
                Trade Confirmation Query ID{' '}
                <span className="text-cerna-text-tertiary">(optional)</span>
              </label>
              <input
                value={tradeConfirmQueryId}
                onChange={(e) => setTradeConfirmQueryId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
                placeholder="e.g. 1234568"
              />
            </div>

            <button
              type="button"
              onClick={runTest}
              disabled={!flexToken.trim() || !activityQueryId.trim() || test.status === 'testing'}
              className="w-full py-2.5 rounded-lg border border-cerna-border text-cerna-text-primary hover:border-cerna-primary transition min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {test.status === 'testing' && <Loader2 size={16} className="animate-spin" />}
              Test Connection
            </button>

            {test.status === 'ok' && (
              <div className="flex items-center gap-2 text-sm text-cerna-profit bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.3)] rounded-lg p-3">
                <Check size={16} />
                Connected — found {test.positions} position{test.positions === 1 ? '' : 's'}.
              </div>
            )}

            {test.status === 'error' && (
              <div className="flex items-start gap-2 text-sm text-cerna-loss bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] rounded-lg p-3">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{test.message}</span>
              </div>
            )}

            {saveError && (
              <p className="text-sm text-cerna-loss">{saveError}</p>
            )}

            <button
              onClick={saveAndSync}
              disabled={test.status !== 'ok' || saving}
              className={cn(
                'w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[48px] flex items-center justify-center gap-2',
                (test.status !== 'ok' || saving) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save &amp; Sync
            </button>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5 animate-fade-in text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(34,197,94,0.15)] mx-auto">
              <Check size={28} className="text-cerna-profit" />
            </div>
            <h2 className="text-2xl font-bold text-cerna-text-primary">Portfolio synced</h2>
            {summary && (
              <div className="glass rounded-xl p-4 space-y-2 text-sm text-left">
                <div className="flex justify-between">
                  <span className="text-cerna-text-tertiary">Positions added</span>
                  <span className="text-cerna-text-primary tabular-nums">{summary.positionsAdded}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cerna-text-tertiary">Positions updated</span>
                  <span className="text-cerna-text-primary tabular-nums">{summary.positionsUpdated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cerna-text-tertiary">Cash updated</span>
                  <span className="text-cerna-text-primary">{summary.cashUpdated ? 'Yes' : 'No'}</span>
                </div>
              </div>
            )}
            <p className="text-sm text-cerna-text-secondary">
              Cerna will auto-sync after each trading day. Tip: when you make a trade, just tell
              me in chat — &quot;I bought 200 BHP at $42&quot; — and your portfolio updates instantly.
            </p>
            <button
              onClick={onComplete}
              className="w-full py-3 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition min-h-[48px]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
