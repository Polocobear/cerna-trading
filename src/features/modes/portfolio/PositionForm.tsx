'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface PositionFormProps {
  onSubmit: (data: {
    ticker: string;
    shares: number;
    cost_basis: number;
    date_acquired?: string;
    thesis?: string;
    company_name?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export function PositionForm({ onSubmit, onCancel }: PositionFormProps) {
  const [ticker, setTicker] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [shares, setShares] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [dateAcquired, setDateAcquired] = useState('');
  const [thesis, setThesis] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSubmit({
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim() || undefined,
      shares: Number(shares),
      cost_basis: Number(costBasis),
      date_acquired: dateAcquired || undefined,
      thesis: thesis.trim() || undefined,
    });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-2xl glass-elevated p-6 space-y-4 animate-slide-up"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add position</h3>
          <button type="button" onClick={onCancel} className="text-cerna-text-tertiary hover:text-cerna-text-primary">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Ticker
            </label>
            <input
              required
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Company name
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Shares
            </label>
            <input
              type="number"
              step="any"
              required
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Cost basis (per share)
            </label>
            <input
              type="number"
              step="any"
              required
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Date acquired
            </label>
            <input
              type="date"
              value={dateAcquired}
              onChange={(e) => setDateAcquired(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
              Thesis
            </label>
            <textarea
              rows={3}
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Why are you buying this?"
              className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md text-cerna-text-secondary hover:text-cerna-text-primary transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add position'}
          </button>
        </div>
      </form>
    </div>
  );
}
