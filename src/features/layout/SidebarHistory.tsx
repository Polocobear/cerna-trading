'use client';

import { useEffect, useState } from 'react';
import type { Mode } from '@/types/chat';
import { cn } from '@/lib/utils/cn';

export interface SessionSummary {
  id: string;
  mode: Mode;
  preview: string;
  lastMessageAt: string;
  messageCount: number;
}

interface SidebarHistoryProps {
  activeSessionId?: string;
  onSelectSession: (s: SessionSummary) => void;
}

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

function truncateTitle(raw: string): string {
  const clean = raw.trim().replace(/\s+/g, ' ');
  if (clean.length <= 40) return clean || '(no message)';
  return clean.slice(0, 40).trimEnd() + '…';
}

export function SidebarHistory({ activeSessionId, onSelectSession }: SidebarHistoryProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/sessions')
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((data: { sessions?: SessionSummary[] }) => {
        if (cancelled) return;
        setSessions(data.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  const groups = groupSessions(sessions);

  const renderGroup = (label: string, items: SessionSummary[]) => {
    if (items.length === 0) return null;
    return (
      <div key={label} className="mb-3">
        <div
          className="px-3 py-1 text-[11px] uppercase tracking-wider font-medium"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {label}
        </div>
        <div className="space-y-0.5">
          {items.map((s) => {
            const isActive = s.id === activeSessionId;
            return (
              <button
                key={s.id}
                onClick={() => onSelectSession(s)}
                className={cn(
                  'relative w-full text-left px-3 py-1.5 rounded-md transition-smooth text-[13px] truncate',
                  isActive
                    ? 'text-cerna-text-primary'
                    : 'text-[rgba(255,255,255,0.6)] hover:text-[rgba(255,255,255,0.9)] hover:bg-[rgba(255,255,255,0.04)]'
                )}
                style={
                  isActive
                    ? { background: 'rgba(124,91,240,0.1)', transitionDuration: '150ms' }
                    : { transitionDuration: '150ms' }
                }
                title={s.preview || '(no message)'}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                    style={{ background: 'var(--color-primary)' }}
                  />
                )}
                {truncateTitle(s.preview)}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar px-2 py-2">
      {loading && sessions.length === 0 && (
        <div className="px-3 py-2 text-xs text-[rgba(255,255,255,0.3)]">Loading…</div>
      )}
      {!loading && sessions.length === 0 && (
        <div className="px-3 py-2 text-xs text-[rgba(255,255,255,0.3)]">No conversations yet.</div>
      )}
      {renderGroup('Today', groups.today)}
      {renderGroup('Yesterday', groups.yesterday)}
      {renderGroup('Last 7 days', groups.lastWeek)}
      {renderGroup('Older', groups.older)}
    </div>
  );
}
