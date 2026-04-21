'use client';

import { MessageSquare, Search, BarChart3, Newspaper, Wallet, Plus } from 'lucide-react';
import type { ViewId } from './AppShell';
import { SidebarHistory, type SessionSummary } from './SidebarHistory';
import { SidebarPortfolio } from './SidebarPortfolio';
import type { Position } from '@/types/portfolio';
import { cn } from '@/lib/utils/cn';

interface SidebarProps {
  activeView: ViewId;
  onSelectView: (v: ViewId) => void;
  onNewChat: () => void;
  onSelectSession: (s: SessionSummary) => void;
  activeSessionId?: string;
  positions: Position[];
  cashAvailable: number;
  variant?: 'desktop' | 'mobile';
}

interface NavItem {
  id: ViewId;
  label: string;
  Icon: typeof MessageSquare;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'screen', label: 'Screen', Icon: Search },
  { id: 'analyze', label: 'Analyze', Icon: BarChart3 },
  { id: 'brief', label: 'Brief', Icon: Newspaper },
  { id: 'portfolio', label: 'Portfolio', Icon: Wallet },
];

export function Sidebar({
  activeView,
  onSelectView,
  onNewChat,
  onSelectSession,
  activeSessionId,
  positions,
  cashAvailable,
  variant = 'desktop',
}: SidebarProps) {
  const isMobile = variant === 'mobile';

  // Desktop: hidden below 768px, collapsed 64px at 768-1023px, full 280px at 1024px+
  // Mobile variant (inside drawer): always full width
  const asideClass = isMobile
    ? 'flex flex-col h-full w-[280px] shrink-0'
    : 'hidden md:flex flex-col h-full shrink-0 sidebar-responsive group';

  return (
    <aside
      className={cn(asideClass, 'border-r overflow-hidden')}
      style={{
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 h-12 px-4 shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="w-8 h-8 rounded-lg bg-cerna-primary flex items-center justify-center text-white font-bold shrink-0">
          C
        </div>
        <span className="font-semibold tracking-tight text-cerna-text-primary whitespace-nowrap sidebar-label">
          Cerna Trading
        </span>
      </div>

      {/* New chat button */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 h-10 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium text-sm transition-smooth glow-primary-hover"
          style={{ minHeight: 40 }}
        >
          <Plus size={16} className="shrink-0" />
          <span className="whitespace-nowrap sidebar-label">New chat</span>
        </button>
      </div>

      {/* Nav */}
      <nav
        className="px-2 py-2 space-y-0.5 shrink-0 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              className={cn(
                'group/item relative w-full flex items-center gap-3 px-3 h-10 rounded-lg transition-smooth text-sm',
                isActive
                  ? 'text-white'
                  : 'text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.04)]'
              )}
              style={{ transitionDuration: '150ms' }}
              title={label}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                  style={{ background: 'var(--color-primary)' }}
                />
              )}
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              <span className="whitespace-nowrap sidebar-label">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* History */}
      <div className="flex-1 overflow-hidden sidebar-label min-h-0">
        <SidebarHistory
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
        />
      </div>

      {/* Portfolio summary */}
      <div className="sidebar-label shrink-0">
        <SidebarPortfolio positions={positions} cashAvailable={cashAvailable} />
      </div>
    </aside>
  );
}
