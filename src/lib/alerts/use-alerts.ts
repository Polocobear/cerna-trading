'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProactiveAlert } from '@/lib/memory/types';

interface AlertsState {
  alerts: ProactiveAlert[];
  unreadCount: number;
  isLoading: boolean;
}

interface UseAlertsResult extends AlertsState {
  dismissAlert: (id: string) => void;
  markRead: (id: string) => void;
  refresh: () => void;
}

const POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes

interface ApiAlert {
  id: string;
  alert_type: string;
  title: string;
  body: string;
  ticker: string | null;
  priority: string;
  is_read: boolean;
  is_dismissed: boolean;
  expires_at: string | null;
  created_at: string;
}

function parseAlert(raw: ApiAlert): ProactiveAlert {
  return {
    id: raw.id,
    alertType: raw.alert_type as ProactiveAlert['alertType'],
    title: raw.title,
    body: raw.body,
    ticker: raw.ticker,
    priority: raw.priority as ProactiveAlert['priority'],
    isRead: raw.is_read,
    isDismissed: raw.is_dismissed,
    expiresAt: raw.expires_at,
    createdAt: raw.created_at,
  };
}

export function useAlerts(): UseAlertsResult {
  const [state, setState] = useState<AlertsState>({
    alerts: [],
    unreadCount: 0,
    isLoading: false,
  });
  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!mountedRef.current) return;
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = (await res.json()) as { alerts: ApiAlert[] };
      if (!mountedRef.current) return;
      const parsed = (data.alerts ?? []).map(parseAlert);
      setState({
        alerts: parsed,
        unreadCount: parsed.filter((a) => !a.isRead).length,
        isLoading: false,
      });
    } catch {
      if (mountedRef.current) setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const triggerCheck = useCallback(async () => {
    try {
      await fetch('/api/alerts/check', { method: 'POST' });
    } catch {
      // Non-fatal
    }
  }, []);

  const refresh = useCallback(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  const dismissAlert = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.map((a) =>
        a.id === id ? { ...a, isDismissed: true } : a
      ),
      unreadCount: prev.alerts.filter((a) => !a.isRead && a.id !== id).length,
    }));
    void fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    });
  }, []);

  const markRead = useCallback((id: string) => {
    setState((prev) => {
      const updated = prev.alerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      );
      return {
        ...prev,
        alerts: updated,
        unreadCount: updated.filter((a) => !a.isRead).length,
      };
    });
    void fetch('/api/alerts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'read' }),
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Trigger check and fetch on mount
    void triggerCheck().then(() => fetchAlerts());

    // Poll every 30 minutes
    pollRef.current = setInterval(() => {
      void triggerCheck().then(() => fetchAlerts());
    }, POLL_INTERVAL);

    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchAlerts, triggerCheck]);

  return { ...state, dismissAlert, markRead, refresh };
}
