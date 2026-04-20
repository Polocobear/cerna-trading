'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Position, WatchlistItem, JournalEntry } from '@/types/portfolio';
import { PositionCard } from './PositionCard';
import { PositionForm } from './PositionForm';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface PortfolioModeProps {
  positions: Position[];
  watchlist: WatchlistItem[];
  journal: JournalEntry[];
  onAnalyze: (ticker: string) => void;
  onAddPosition: (data: {
    ticker: string;
    shares: number;
    cost_basis: number;
    date_acquired?: string;
    thesis?: string;
    company_name?: string;
  }) => Promise<void>;
  onClosePosition: (position: Position) => Promise<void>;
  onDeletePosition: (id: string) => Promise<void>;
  onAddWatch: (data: { ticker: string; target_price?: number; notes?: string }) => Promise<void>;
  onRemoveWatch: (id: string) => Promise<void>;
}

type Tab = 'positions' | 'watchlist' | 'journal';

const ACTION_COLORS: Record<string, string> = {
  buy: 'text-cerna-profit bg-[rgba(34,197,94,0.12)]',
  add: 'text-cerna-profit bg-[rgba(34,197,94,0.12)]',
  sell: 'text-cerna-loss bg-[rgba(239,68,68,0.12)]',
  trim: 'text-cerna-loss bg-[rgba(239,68,68,0.12)]',
  pass: 'text-cerna-text-tertiary bg-[rgba(107,114,128,0.12)]',
};

export function PortfolioMode(props: PortfolioModeProps) {
  const [tab, setTab] = useState<Tab>('positions');
  const [showForm, setShowForm] = useState(false);
  const [watchTicker, setWatchTicker] = useState('');
  const [watchPrice, setWatchPrice] = useState('');
  const [watchNotes, setWatchNotes] = useState('');

  async function handleAddWatch(e: React.FormEvent) {
    e.preventDefault();
    await props.onAddWatch({
      ticker: watchTicker,
      target_price: watchPrice ? Number(watchPrice) : undefined,
      notes: watchNotes || undefined,
    });
    setWatchTicker('');
    setWatchPrice('');
    setWatchNotes('');
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center gap-1 mb-5 border-b border-cerna-border">
        {(['positions', 'watchlist', 'journal'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium capitalize transition',
              tab === t ? 'text-cerna-text-primary' : 'text-cerna-text-tertiary hover:text-cerna-text-secondary'
            )}
          >
            {t}
            {tab === t && <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-cerna-primary rounded-full" />}
          </button>
        ))}
      </div>

      {tab === 'positions' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition"
            >
              <Plus size={16} />
              Add position
            </button>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {props.positions.length === 0 && (
              <p className="text-cerna-text-tertiary">No positions yet. Add your first.</p>
            )}
            {props.positions.map((p) => (
              <PositionCard
                key={p.id}
                position={p}
                onAnalyze={props.onAnalyze}
                onClose={props.onClosePosition}
                onDelete={props.onDeletePosition}
              />
            ))}
          </div>
          {showForm && (
            <PositionForm
              onSubmit={async (d) => {
                await props.onAddPosition(d);
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>
      )}

      {tab === 'watchlist' && (
        <div>
          <form
            onSubmit={handleAddWatch}
            className="flex flex-wrap items-end gap-2 mb-5 p-4 bg-cerna-bg-secondary rounded-xl border border-cerna-border"
          >
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
                Ticker
              </label>
              <input
                required
                value={watchTicker}
                onChange={(e) => setWatchTicker(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
                Target price
              </label>
              <input
                type="number"
                step="any"
                value={watchPrice}
                onChange={(e) => setWatchPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
                Notes
              </label>
              <input
                value={watchNotes}
                onChange={(e) => setWatchNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition"
            >
              Add to watchlist
            </button>
          </form>

          <div className="grid md:grid-cols-2 gap-3">
            {props.watchlist.length === 0 && (
              <p className="text-cerna-text-tertiary">Nothing on your watchlist.</p>
            )}
            {props.watchlist.map((w) => (
              <div
                key={w.id}
                className="p-4 rounded-xl bg-cerna-bg-secondary border border-cerna-border flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-cerna-text-primary">{w.ticker}</div>
                  {w.target_price && (
                    <div className="text-sm text-cerna-text-secondary">
                      Target {formatCurrency(w.target_price)}
                    </div>
                  )}
                  {w.notes && <div className="text-xs text-cerna-text-tertiary mt-1">{w.notes}</div>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => props.onAnalyze(w.ticker)}
                    className="px-3 py-1.5 text-xs rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white transition"
                  >
                    Analyze
                  </button>
                  <button
                    onClick={() => props.onRemoveWatch(w.id)}
                    className="px-3 py-1.5 text-xs rounded-md text-cerna-text-tertiary hover:text-cerna-loss transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="space-y-2">
          {props.journal.length === 0 && (
            <p className="text-cerna-text-tertiary">No journal entries yet.</p>
          )}
          {props.journal.map((j) => (
            <div key={j.id} className="p-4 rounded-xl bg-cerna-bg-secondary border border-cerna-border">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'px-2 py-0.5 text-xs uppercase font-semibold rounded',
                    ACTION_COLORS[j.action] ?? ''
                  )}
                >
                  {j.action}
                </span>
                <span className="font-bold text-cerna-text-primary">{j.ticker}</span>
                {j.price && <span className="text-sm text-cerna-text-secondary">@ {formatCurrency(j.price)}</span>}
                <span className="text-xs text-cerna-text-tertiary ml-auto">{formatDate(j.created_at)}</span>
              </div>
              {j.reasoning && <p className="mt-2 text-sm text-cerna-text-secondary">{j.reasoning}</p>}
              {j.outcome_notes && (
                <p className="mt-2 text-xs text-cerna-text-tertiary italic">Outcome: {j.outcome_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
