'use client';

import { useState } from 'react';
import type { Position } from '@/types/portfolio';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface PositionCardProps {
  position: Position;
  onAnalyze: (ticker: string) => void;
  onClose: (position: Position) => void;
  onDelete: (id: string) => void;
}

export function PositionCard({ position, onAnalyze, onClose, onDelete }: PositionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const value = position.shares * position.cost_basis;

  return (
    <div className="p-4 rounded-xl bg-cerna-bg-secondary border border-cerna-border hover:border-cerna-border-hover transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-cerna-text-primary">{position.ticker}</span>
            <span className="text-xs text-cerna-text-tertiary">{position.exchange}</span>
          </div>
          {position.company_name && (
            <p className="text-sm text-cerna-text-secondary">{position.company_name}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-cerna-text-primary">{formatCurrency(value)}</div>
          <div className="text-xs text-cerna-text-tertiary">
            {position.shares} × {formatCurrency(position.cost_basis)}
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-cerna-text-tertiary space-y-0.5">
        {position.date_acquired && <div>Acquired: {formatDate(position.date_acquired)}</div>}
        {position.status === 'closed' && position.close_price && (
          <div>
            Closed at {formatCurrency(position.close_price)} · {formatDate(position.closed_at ?? '')}
          </div>
        )}
      </div>

      {position.thesis && (
        <div className="mt-3 text-sm text-cerna-text-secondary">
          <p className={expanded ? '' : 'line-clamp-2'}>{position.thesis}</p>
          {position.thesis.length > 120 && (
            <button
              onClick={() => setExpanded((x) => !x)}
              className="text-xs text-cerna-primary mt-1 hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onAnalyze(position.ticker)}
          className="px-3 py-1.5 text-xs rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white transition"
        >
          Analyze
        </button>
        {position.status === 'open' && (
          <button
            onClick={() => onClose(position)}
            className="px-3 py-1.5 text-xs rounded-md bg-cerna-bg-tertiary border border-cerna-border text-cerna-text-secondary hover:text-cerna-text-primary transition"
          >
            Close position
          </button>
        )}
        <button
          onClick={() => onDelete(position.id)}
          className="px-3 py-1.5 text-xs rounded-md text-cerna-text-tertiary hover:text-cerna-loss transition ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
