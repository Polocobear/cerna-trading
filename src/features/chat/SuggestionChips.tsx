'use client';

import { cn } from '@/lib/utils/cn';
import type { Position } from '@/types/portfolio';

/**
 * Build up to 4 context-aware starter prompts. Top holdings (ranked by shares*cost_basis)
 * feed personalised suggestions; watchlist provides analysis starters; otherwise
 * we fall back to general market research prompts.
 */
export function getDefaultSuggestions(
  positions: Position[],
  watchlist: { ticker: string }[] = []
): string[] {
  const open = positions.filter((p) => p.status === 'open');
  const ranked = [...open].sort(
    (a, b) => b.shares * b.cost_basis - a.shares * a.cost_basis
  );
  const top = ranked[0]?.ticker;
  const watchTop = watchlist[0]?.ticker;

  const out: string[] = [];
  if (top) out.push(`Should I hold ${top}?`);
  if (watchTop && watchTop !== top) out.push(`Analyze ${watchTop} fundamentals`);
  out.push("What's moving in the markets today?");
  if (open.length > 0) out.push("How's my portfolio looking?");
  else out.push('Screen for dividend stocks');
  return out.slice(0, 4);
}

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (s: string) => void;
  layout?: 'grid' | 'inline';
}

export function SuggestionChips({ suggestions, onSelect, layout = 'grid' }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div
      className={cn(
        layout === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 gap-2'
          : 'flex flex-wrap gap-2'
      )}
    >
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="text-left px-4 py-3 rounded-lg text-[13px] text-[rgba(255,255,255,0.7)] hover:text-cerna-text-primary transition-smooth"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            transitionDuration: '150ms',
            minHeight: 44,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
