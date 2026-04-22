'use client';

import { ChevronLeft, ChevronRight, LayoutDashboard, MessageSquare, Wallet, Plus } from 'lucide-react';
import type { ViewId } from './AppShell';
import { SidebarHistory, type SessionSummary } from './SidebarHistory';
import { SidebarPortfolio } from './SidebarPortfolio';
import { AlertBadge } from '@/features/alerts/AlertBadge';
import { useAlerts } from '@/lib/alerts/use-alerts';
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
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  id: ViewId;
  label: string;
  Icon: typeof MessageSquare;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
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
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const isMobile = variant === 'mobile';
  const { unreadCount } = useAlerts();

  const isCollapsed = !isMobile && collapsed;

  const asideClass = isMobile
    ? 'flex flex-col h-full w-[280px] shrink-0'
    : 'hidden md:flex flex-col h-full shrink-0 transition-[width] duration-200 ease-out';

  return (
    <aside
      className={cn(asideClass, 'border-r overflow-hidden')}
      style={{
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
        width: isMobile
          ? '280px'
          : isCollapsed
          ? 'var(--sidebar-collapsed)'
          : 'var(--sidebar-width)',
      }}
    >
      {/* Header */}
      <div
        className={cn(
          'relative flex items-center h-12 shrink-0 border-b',
          isCollapsed ? 'justify-center px-2' : 'gap-2 px-4'
        )}
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        <div className="w-8 h-8 rounded-lg bg-cerna-primary flex items-center justify-center text-white font-bold shrink-0">
          C
        </div>
        {!isCollapsed && (
          <>
            <span className="font-semibold tracking-tight text-cerna-text-primary whitespace-nowrap">
              Cerna Trading
            </span>
            {!isMobile && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="ml-auto h-8 w-8 rounded-lg text-[rgba(255,255,255,0.45)] hover:text-cerna-text-primary hover:bg-[rgba(255,255,255,0.05)] transition-smooth flex items-center justify-center"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            )}
          </>
        )}
        {isCollapsed && onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="absolute top-2 right-2 h-8 w-8 rounded-lg text-[rgba(255,255,255,0.45)] hover:text-cerna-text-primary hover:bg-[rgba(255,255,255,0.05)] transition-smooth flex items-center justify-center"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <ChevronRight size={16} />
          </button>
        )}
      </div>

      {/* New chat button */}
      <div className={cn('pt-3 pb-2 shrink-0', isCollapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={onNewChat}
          className={cn(
            'w-full flex items-center h-10 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium text-sm transition-smooth glow-primary-hover',
            isCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
          )}
          style={{ minHeight: 40 }}
          title="New chat"
        >
          <Plus size={16} className="shrink-0" />
          {!isCollapsed && <span className="whitespace-nowrap">New chat</span>}
        </button>
      </div>

      {/* Nav */}
      <nav
        className={cn(
          'py-2 space-y-0.5 shrink-0 border-b',
          isCollapsed ? 'px-2' : 'px-2'
        )}
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              className={cn(
                'group/item relative w-full flex items-center h-10 rounded-lg transition-smooth text-sm',
                isCollapsed ? 'justify-center px-0' : 'gap-3 px-3',
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
              {!isCollapsed && <span className="whitespace-nowrap">{label}</span>}
              {!isCollapsed && id === 'chat' && <AlertBadge count={unreadCount} />}
            </button>
          );
        })}
      </nav>

      {/* History */}
      {!isCollapsed && (
        <div className="flex-1 overflow-hidden min-h-0">
          <SidebarHistory
            activeSessionId={activeSessionId}
            onSelectSession={onSelectSession}
          />
        </div>
      )}

      {/* Portfolio summary */}
      {!isCollapsed && (
        <div className="shrink-0">
          <SidebarPortfolio positions={positions} cashAvailable={cashAvailable} />
        </div>
      )}
    </aside>
  );
}
