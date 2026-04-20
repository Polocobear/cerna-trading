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
    <div className="glass border-b border-cerna-border">
      <div className="flex items-center gap-1 px-2 md:px-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
        {tabs.map(({ id, label, Icon, description }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              title={description}
              onClick={() => onChange(id)}
              className={cn(
                'relative flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 min-w-[64px] md:min-w-0 px-3 md:px-4 py-3 text-xs md:text-sm font-medium transition-smooth snap-center shrink-0 min-h-[56px] md:min-h-[48px]',
                isActive
                  ? 'text-cerna-text-primary'
                  : 'text-cerna-text-tertiary hover:text-cerna-text-secondary'
              )}
            >
              <Icon size={isActive ? 20 : 18} strokeWidth={1.5} className="md:!w-[18px] md:!h-[18px]" />
              <span className={cn('md:inline', isActive ? 'inline' : 'hidden md:inline')}>{label}</span>
              {isActive && (
                <span className="absolute left-2 right-2 bottom-0 h-0.5 bg-cerna-primary rounded-full glow-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
