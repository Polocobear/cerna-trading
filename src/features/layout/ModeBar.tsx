'use client';

import { Search, BarChart3, Newspaper, Wallet, MessageCircle } from 'lucide-react';
import type { Mode } from '@/types/chat';
import { cn } from '@/lib/utils/cn';

interface ModeBarProps {
  active: Mode;
  onChange: (mode: Mode) => void;
}

const tabs: Array<{ id: Mode; label: string; Icon: typeof Search; description: string }> = [
  { id: 'screen', label: 'Screen', Icon: Search, description: 'Find undervalued opportunities' },
  { id: 'analyze', label: 'Analyze', Icon: BarChart3, description: 'Deep-dive on a position' },
  { id: 'brief', label: 'Brief', Icon: Newspaper, description: 'Morning intelligence update' },
  { id: 'portfolio', label: 'Portfolio', Icon: Wallet, description: 'View & manage positions' },
  { id: 'ask', label: 'Ask', Icon: MessageCircle, description: 'General financial questions' },
];

export function ModeBar({ active, onChange }: ModeBarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-cerna-border bg-cerna-bg-secondary px-4">
      {tabs.map(({ id, label, Icon, description }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            type="button"
            title={description}
            onClick={() => onChange(id)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition',
              isActive
                ? 'text-cerna-text-primary'
                : 'text-cerna-text-tertiary hover:text-cerna-text-secondary'
            )}
          >
            <Icon size={18} />
            <span>{label}</span>
            {isActive && (
              <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-cerna-primary rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
