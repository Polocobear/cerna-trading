'use client';

/**
 * Phase 7C — React hook wiring the frontend chat UI to the /api/agent-chat SSE pipeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentName } from './types';

export type AgentStatusState = 'pending' | 'running' | 'complete' | 'error';

export interface AgentStatus {
  name: AgentName;
  description: string;
  status: AgentStatusState;
  summary?: string;
  error?: string;
  sources?: Source[];
}

export interface Source {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  followUps?: string[];
  createdAt: string;
}

interface UseAgentChatOptions {
  sessionId: string;
  depth: 'standard' | 'deep';
}

interface UseAgentChatResult {
  messages: AgentChatMessage[];
  agentStatuses: AgentStatus[];
  isLoading: boolean;
  isStreaming: boolean;
  deepRemaining: number;
  sources: Source[];
  followUps: string[];
  sessionTitle: string | null;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  resetSession: () => void;
  loadSession: (messages: AgentChatMessage[]) => void;
}

// ---- SSE event discriminated union (matches Phase 7B contract) -----------

type PlanEvent = {
  type: 'plan';
  agents: Array<{ name: AgentName; description: string }>;
};
type AgentStartEvent = { type: 'agent_start'; agent: AgentName; description: string };
type AgentCompleteEvent = { type: 'agent_complete'; agent: AgentName; summary: string; sources?: Source[] };
type AgentErrorEvent = { type: 'agent_error'; agent: AgentName; error: string };
type StreamEvent = { type: 'stream'; content: string };
type SourcesEvent = { type: 'sources'; sources: Source[] };
type FollowUpsEvent = { type: 'follow_ups'; suggestions: string[] };
type SessionTitleEvent = { type: 'session_title'; title: string };
type DoneEvent = { type: 'done'; model: 'flash' | 'mixed' | 'error'; deepRemaining: number };

type SSEEvent =
  | PlanEvent
  | AgentStartEvent
  | AgentCompleteEvent
  | AgentErrorEvent
  | StreamEvent
  | SourcesEvent
  | FollowUpsEvent
  | SessionTitleEvent
  | DoneEvent;

function parseSSEChunk(raw: string): SSEEvent | null {
  // Raw is one SSE event — possibly multi-line. Concatenate all data: lines.
  const lines = raw.split('\n');
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.type !== 'string') return null;
    return obj as unknown as SSEEvent;
  } catch {
    return null;
  }
}

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeClientErrorMessage(message: string): string {
  if (
    /Gemini/i.test(message) ||
    /request failed \(\d+\)/i.test(message) ||
    /^\s*\d{3}\b/.test(message)
  ) {
    return 'The AI service is temporarily unavailable. Please try again.';
  }
  return message || 'Something went wrong. Please try again.';
}

function waitWithJitter(baseMs: number): Promise<void> {
  const jitter = Math.random() * 200;
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
}

const CLIENT_STREAM_TIMEOUT_MS = 62000;

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatResult {
  const { sessionId, depth } = options;

  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [deepRemaining, setDeepRemaining] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string>('');
  const retryCountRef = useRef(0);

  // Fetch deep-remaining initial value.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/deep-usage')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { remaining?: number } | null) => {
        if (cancelled || !data || typeof data.remaining !== 'number') return;
        setDeepRemaining(data.remaining);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setAgentStatuses([]);
    setSources([]);
    setFollowUps([]);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
    retryCountRef.current = 0;
  }, []);

  const loadSession = useCallback((initial: AgentChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(initial);
    setAgentStatuses([]);
    // Seed sources / follow-ups from the latest assistant message (if any).
    const lastAssistant = [...initial].reverse().find((m) => m.role === 'assistant');
    setSources(lastAssistant?.sources ?? []);
    setFollowUps(lastAssistant?.followUps ?? []);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  const doSend = useCallback(
    async (messageText: string, isRetry: boolean): Promise<void> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setIsLoading(true);
      setIsStreaming(false);
      setSources([]);
      setFollowUps([]);

      // Snapshot prior history (last 5 user+assistant turns) BEFORE adding optimistic user msg.
      let historyForBackend: Array<{ role: 'user' | 'assistant'; content: string }> = [];
      setMessages((prev) => {
        historyForBackend = prev.slice(-5).map((m) => ({ role: m.role, content: m.content }));
        if (isRetry) return prev; // user msg already appended on first attempt
        const userMsg: AgentChatMessage = {
          id: genId(),
          role: 'user',
          content: messageText,
          createdAt: new Date().toISOString(),
        };
        return [...prev, userMsg];
      });

      const assistantId = genId();
      let assistantCreated = false;
      let assistantHasContent = false;
      let sawDone = false;
      let requestTimedOut = false;
      const timeoutId = window.setTimeout(() => {
        requestTimedOut = true;
        controller.abort();
      }, CLIENT_STREAM_TIMEOUT_MS);
      const ensureAssistant = () => {
        if (assistantCreated) return;
        assistantCreated = true;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          },
        ]);
      };

      const appendToAssistant = (chunk: string) => {
        if (chunk.length > 0) {
          assistantHasContent = true;
        }
        ensureAssistant();
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + chunk } : m))
        );
      };

      const failIncompleteRun = (fallbackMessage: string) => {
        setAgentStatuses((prev) =>
          prev.map((status) =>
            status.status === 'complete' || status.status === 'error'
              ? status
              : { ...status, status: 'error', error: 'Request timed out before completion.' }
          )
        );
        ensureAssistant();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: assistantHasContent
                    ? `${m.content.trimEnd()}\n\n${fallbackMessage}`
                    : fallbackMessage,
                }
              : m
          )
        );
      };

      try {
        const res = await fetch('/api/agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            sessionId,
            depth,
            history: historyForBackend,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sawAny = false;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.trim()) continue;
            const evt = parseSSEChunk(part);
            if (!evt) continue;
            if (!sawAny) {
              sawAny = true;
              setIsLoading(false);
              setIsStreaming(true);
            }
            switch (evt.type) {
              case 'plan': {
                setAgentStatuses(
                  evt.agents.map((a) => ({
                    name: a.name,
                    description: a.description,
                    status: 'pending',
                  }))
                );
                break;
              }
              case 'agent_start': {
                setAgentStatuses((prev) =>
                  prev.map((s) =>
                    s.name === evt.agent
                      ? { ...s, status: 'running', description: evt.description || s.description }
                      : s
                  )
                );
                break;
              }
              case 'agent_complete': {
                setAgentStatuses((prev) =>
                  prev.map((s) =>
                    s.name === evt.agent
                      ? { ...s, status: 'complete', summary: evt.summary, sources: evt.sources }
                      : s
                  )
                );
                break;
              }
              case 'agent_error': {
                setAgentStatuses((prev) =>
                  prev.map((s) =>
                    s.name === evt.agent ? { ...s, status: 'error', error: evt.error } : s
                  )
                );
                break;
              }
              case 'stream': {
                appendToAssistant(evt.content);
                break;
              }
              case 'sources': {
                setSources(evt.sources);
                ensureAssistant();
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, sources: evt.sources } : m))
                );
                break;
              }
              case 'follow_ups': {
                setFollowUps(evt.suggestions);
                ensureAssistant();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, followUps: evt.suggestions } : m
                  )
                );
                break;
              }
              case 'session_title': {
                setSessionTitle(evt.title);
                break;
              }
              case 'done': {
                sawDone = true;
                setDeepRemaining(evt.deepRemaining);
                setIsStreaming(false);
                setIsLoading(false);
                try {
                  await reader.cancel();
                } catch {
                  // ignore
                }
                retryCountRef.current = 0;
                // Also strip the raw <sources>…</sources> tag from the assistant content
                // (backend strips it from the saved message but the streamed content still
                // contains the raw tag). Cleanup for UI only.
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content.replace(/<sources>[\s\S]*?<\/sources>/i, '').trimEnd() }
                      : m
                  )
                );
                return;
              }
              default: {
                // ignore unknown event types
                break;
              }
            }
          }
        }
        // Stream ended without a `done` event.
        if (!sawDone) {
          const fallback =
            'The request took too long and did not complete. Please try again.';
          failIncompleteRun(fallback);
          setError(fallback);
        }
        setIsStreaming(false);
        setIsLoading(false);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (requestTimedOut) {
            const fallback =
              'The request took too long and did not complete. Please try again.';
            failIncompleteRun(fallback);
            setError(fallback);
            setIsLoading(false);
            setIsStreaming(false);
          }
          return;
        }
        const msg = err instanceof Error ? err.message : 'Unknown error';
        const safeError = sanitizeClientErrorMessage(msg);
        if (!isRetry && retryCountRef.current < 1) {
          retryCountRef.current += 1;
          await waitWithJitter(300);
          await doSend(messageText, true);
          return;
        }
        console.error('[agent-chat] client send failed', err);
        setError(safeError);
        setIsLoading(false);
        setIsStreaming(false);
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [sessionId, depth]
  );

  const sendMessage = useCallback(
    async (messageText: string): Promise<void> => {
      const trimmed = messageText.trim();
      if (!trimmed) return;
      lastMessageRef.current = trimmed;
      retryCountRef.current = 0;
      await doSend(trimmed, false);
    },
    [doSend]
  );

  return {
    messages,
    agentStatuses,
    isLoading,
    isStreaming,
    deepRemaining,
    sources,
    followUps,
    sessionTitle,
    error,
    sendMessage,
    resetSession,
    loadSession,
  };
}
