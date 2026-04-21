'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { ProactiveAlert, AlertPriority } from '@/lib/memory/types';

interface AlertBannerProps {
  alerts: ProactiveAlert[];
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  onAskAbout: (message: string) => void;
}

const PRIORITY_BORDER: Record<AlertPriority, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  medium: '#7c5bf0',
  low: 'rgba(255,255,255,0.2)',
};

const PRIORITY_BG: Record<AlertPriority, string> = {
  urgent: 'rgba(239,68,68,0.08)',
  high: 'rgba(245,158,11,0.08)',
  medium: 'rgba(124,91,240,0.08)',
  low: 'rgba(255,255,255,0.04)',
};

const MAX_VISIBLE = 3;

const READ_DELAY_MS = 30_000;

function buildAskMessage(alert: ProactiveAlert): string {
  if (alert.ticker) {
    switch (alert.alertType) {
      case 'earnings_upcoming':
        return `Tell me about ${alert.ticker}'s upcoming earnings and what it means for my position`;
      case 'price_target_hit':
        return `${alert.ticker} has hit my target price. Should I buy now? Do a full analysis.`;
      case 'significant_move':
        return `${alert.ticker} just moved significantly. What happened and what should I do?`;
      case 'decision_review':
        return `Let's review my ${alert.ticker} position. Has the investment thesis changed?`;
      case 'concentration_warning':
        return `${alert.ticker} is overweight in my portfolio. What are my options to reduce concentration?`;
      default:
        return `Tell me more about ${alert.ticker}`;
    }
  }
  return alert.title;
}

function AlertItem({
  alert,
  onDismiss,
  onMarkRead,
  onAskAbout,
}: {
  alert: ProactiveAlert;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  onAskAbout: (message: string) => void;
}) {
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!alert.isRead) {
      readTimerRef.current = setTimeout(() => {
        onMarkRead(alert.id);
      }, READ_DELAY_MS);
    }
    return () => {
      if (readTimerRef.current) clearTimeout(readTimerRef.current);
    };
  }, [alert.id, alert.isRead, onMarkRead]);

  const borderColor = PRIORITY_BORDER[alert.priority];
  const bgColor = PRIORITY_BG[alert.priority];

  return (
    <div
      className="rounded-lg px-4 py-3 flex items-start gap-3 animate-fade-in"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}30`,
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <Zap
        size={14}
        className="shrink-0 mt-0.5"
        style={{ color: borderColor }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-cerna-text-primary leading-snug">
          {alert.title}
        </p>
        <p className="text-[12px] text-cerna-text-secondary mt-0.5 leading-relaxed">
          {alert.body}
        </p>
        <button
          onClick={() => onAskAbout(buildAskMessage(alert))}
          className="mt-2 text-[11px] font-medium hover:underline"
          style={{ color: borderColor }}
        >
          Ask about this →
        </button>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="shrink-0 text-[rgba(255,255,255,0.3)] hover:text-[rgba(255,255,255,0.6)] transition-smooth"
        aria-label="Dismiss alert"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function AlertBanner({ alerts, onDismiss, onMarkRead, onAskAbout }: AlertBannerProps) {
  const [expanded, setExpanded] = useState(false);

  const visible = alerts
    .filter((a) => !a.isDismissed)
    .sort((a, b) => {
      const pOrder: Record<AlertPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      const pDiff = pOrder[a.priority] - pOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  if (visible.length === 0) return null;

  const shown = expanded ? visible : visible.slice(0, MAX_VISIBLE);
  const overflow = visible.length - MAX_VISIBLE;

  return (
    <div className="px-4 pt-3 space-y-2">
      {shown.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onDismiss={onDismiss}
          onMarkRead={onMarkRead}
          onAskAbout={onAskAbout}
        />
      ))}

      {!expanded && overflow > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth py-1"
        >
          <ChevronDown size={13} />
          {overflow} more alert{overflow > 1 ? 's' : ''}
        </button>
      )}

      {expanded && overflow > 0 && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full flex items-center justify-center gap-1.5 text-[12px] text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth py-1"
        >
          <ChevronUp size={13} />
          Show less
        </button>
      )}
    </div>
  );
}
