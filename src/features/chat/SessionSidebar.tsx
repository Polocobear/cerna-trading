'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Search, BarChart3, Newspaper, MessageCircle, Wallet } from 'lucide-react';
import type { Mode } from '@/types/chat';
import { cn } from '@/lib/utils/cn';

export interface SessionSummary {
  id: string;
  mode: Mode;
  preview: string;
  lastMessageAt: string;
  messageCount: number;
}

interface SessionSidebarProps {
  open: boolean;
  onClose: () => void;
  onSelect: (session: SessionSummary) => void;
  onNewChat: () => void;
  activeSessionId?: string;
  refreshKey?: number;
}

const MODE_ICONS: Record<Mode, typeof Search> = {
  screen: Search,
  analyze: BarChart3,
  brief: Newspaper,
  portfolio: Wallet,
  ask: MessageCircle,
};

function groupSessions(sessions: SessionSummary[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const today: SessionSummary[] = [];
  const yesterday: SessionSummary[] = [];
  const lastWeek: SessionSummary[] = [];
  const older: SessionSummary[] = [];

  for (const s of sessions) {
    const t = new Date(s.lastMessageAt).getTime();
    if (t >= startOfToday) today.push(s);
    else if (t >= startOfYesterday) yesterday.push(s);
    else if (t >= sevenDaysAgo) lastWeek.push(s);
    else older.push(s);
  }

  return { today, yesterday, lastWeek, older };
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

export function SessionSidebar({
  open,
  onClose,
  onSelect,
  onNewChat,
  activeSessionId,
  refreshKey,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data: { sessions: SessionSummary[] }) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [open, refreshKey]);

  if (!open) return null;

  const { today, yesterday, lastWeek, older } = groupSessions(sessions);

  const renderGroup = (label: string, items: SessionSummary[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label} className="mb-5">
        <div className="px-3 py-1 text-xs uppercase tracking-wider text-cerna-text-tertiary">{label}</div>
        <div className="space-y-0.5">
          {items.map((s) => {
            const Icon = MODE_ICONS[s.mode] ?? MessageCircle;
            const isActive = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className={cn(
                  'w-full flex items-start gap-2.5 p-3 rounded-lg text-left transition-smooth min-h-[56px]',
                  isActive ? 'bg-cerna-bg-hover' : 'hover:bg-cerna-bg-hover'
                )}
              >
                <Icon size={14} className="mt-1 shrink-0 text-cerna-text-tertiary" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-cerna-text-tertiary capitalize">{s.mode}</div>
                  <div className="text-sm text-cerna-text-primary truncate">
                    {s.preview || '(no message)'}
                  </div>
                </div>
                <span className="text-xs text-cerna-text-tertiary shrink-0 mt-1">
                  {formatTimestamp(s.lastMessageAt)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="w-[85vw] sm:w-80 h-full glass-elevated flex flex-col animate-fade-in"
        style={{ animation: 'fade-in 0.2s ease-out' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cerna-border">
          <span className="text-sm font-semibold text-cerna-text-primary">Chat History</span>
          <button
            onClick={onClose}
            className="p-2 -m-2 text-cerna-text-tertiary hover:text-cerna-text-primary transition-smooth"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-3 border-b border-cerna-border">
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white transition-smooth min-h-[40px]"
          >
            <Plus size={16} />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {loading && <div className="p-3 text-sm text-cerna-text-tertiary">Loading…</div>}
          {!loading && sessions.length === 0 && (
            <div className="p-3 text-sm text-cerna-text-tertiary">No conversations yet.</div>
          )}
          {!loading && (
            <>
              {renderGroup('Today', today)}
              {renderGroup('Yesterday', yesterday)}
              {renderGroup('Last 7 days', lastWeek)}
              {renderGroup('Older', older)}
            </>
          )}
        </div>
      </div>
      <div className="flex-1 bg-black/60 animate-fade-in" onClick={onClose} />
    </div>
  );
}
