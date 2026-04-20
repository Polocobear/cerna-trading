'use client';

import { cn } from '@/lib/utils/cn';

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
