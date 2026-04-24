'use client';

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

export type Phase = 'idle' | 'orchestrating' | 'researching' | 'synthesizing' | 'done';

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
  phase: Phase;
  sendMessage: (message: string) => Promise<void>;
  resetSession: () => void;
  loadSession: (messages: AgentChatMessage[]) => void;
  resumePendingSession: () => void;
}

interface DirectAgentResponse {
  success: boolean;
  content: string | null;
  sources?: Source[];
  error?: string;
  model?: string;
}

interface TriggerAgentHandleResponse {
  runId: string;
  publicAccessToken?: string;
  agentType: AgentName;
}

interface PendingTriggerHandle extends TriggerAgentHandleResponse {
  toolName: string;
  description: string;
}

interface TriggerStatusResponse {
  status?: string;
  output?: DirectAgentResponse | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
  finishedAt?: string | null;
}

interface TriggerTaskMetadata extends Record<string, unknown> {
  status?: string;
  agentStatus?: string;
  agentStatusMessage?: string;
  geminiStarted?: number;
  geminiCompleted?: number;
  geminiElapsedMs?: number;
  elapsedMs?: number;
}

interface PendingResult {
  name: string;
  success: boolean;
  content: string | null;
  sources: Source[];
  error?: string;
}

interface PersistedPendingHandle {
  runId: string;
  toolName: string;
  description: string;
}

interface PersistedPendingSessionState {
  version: 1;
  phase: 'researching' | 'synthesizing';
  assistantId: string;
  context: Record<string, unknown>;
  directResults: PendingResult[];
  triggerHandles: PersistedPendingHandle[];
  results: PendingResult[];
}

const TERMINAL_TRIGGER_FAILURES = new Set([
  'FAILED',
  'CANCELED',
  'CRASHED',
  'SYSTEM_FAILURE',
  'TIMED_OUT',
  'EXPIRED',
]);
const MAX_WAIT = 600000;
const POLL_INTERVAL_MS = 2000;
const PENDING_SESSION_VERSION = 1;

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pendingSessionKey(sessionId: string): string {
  return `cerna-agent-pending:${sessionId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeSource(value: unknown): Source | null {
  if (!isRecord(value) || typeof value.url !== 'string' || typeof value.domain !== 'string') {
    return null;
  }

  return {
    title: typeof value.title === 'string' ? value.title : value.domain,
    url: value.url,
    domain: value.domain,
    snippet: typeof value.snippet === 'string' ? value.snippet : undefined,
  };
}

function sanitizePendingResult(value: unknown): PendingResult | null {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.success !== 'boolean' ||
    (value.content !== null && typeof value.content !== 'string')
  ) {
    return null;
  }

  return {
    name: value.name,
    success: value.success,
    content: value.content,
    sources: Array.isArray(value.sources)
      ? value.sources.map(sanitizeSource).filter((source): source is Source => source !== null)
      : [],
    error: typeof value.error === 'string' ? value.error : undefined,
  };
}

function sanitizePendingHandle(value: unknown): PersistedPendingHandle | null {
  if (
    !isRecord(value) ||
    typeof value.runId !== 'string' ||
    typeof value.toolName !== 'string' ||
    typeof value.description !== 'string'
  ) {
    return null;
  }

  return {
    runId: value.runId,
    toolName: value.toolName,
    description: value.description,
  };
}

function readPendingSessionState(sessionId: string): PersistedPendingSessionState | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(pendingSessionKey(sessionId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed) ||
      parsed.version !== PENDING_SESSION_VERSION ||
      (parsed.phase !== 'researching' && parsed.phase !== 'synthesizing') ||
      typeof parsed.assistantId !== 'string' ||
      !isRecord(parsed.context)
    ) {
      return null;
    }

    return {
      version: PENDING_SESSION_VERSION,
      phase: parsed.phase,
      assistantId: parsed.assistantId,
      context: parsed.context,
      directResults: Array.isArray(parsed.directResults)
        ? parsed.directResults
            .map(sanitizePendingResult)
            .filter((result): result is PendingResult => result !== null)
        : [],
      triggerHandles: Array.isArray(parsed.triggerHandles)
        ? parsed.triggerHandles
            .map(sanitizePendingHandle)
            .filter((handle): handle is PersistedPendingHandle => handle !== null)
        : [],
      results: Array.isArray(parsed.results)
        ? parsed.results
            .map(sanitizePendingResult)
            .filter((result): result is PendingResult => result !== null)
        : [],
    };
  } catch {
    return null;
  }
}

function writePendingSessionState(
  sessionId: string,
  state: PersistedPendingSessionState | null
): void {
  if (typeof window === 'undefined') return;

  if (!state) {
    window.sessionStorage.removeItem(pendingSessionKey(sessionId));
    return;
  }

  window.sessionStorage.setItem(pendingSessionKey(sessionId), JSON.stringify(state));
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

function isTriggerHandleResponse(value: unknown): value is TriggerAgentHandleResponse {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as { runId?: unknown }).runId === 'string';
}

function readNumericMetadata(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatElapsedMs(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${totalSeconds}s`;
}

function getTriggerElapsedMs(
  metadata: Record<string, unknown> | undefined,
  fallbackStartedAt: number
): number {
  const explicitElapsed =
    readNumericMetadata(metadata?.elapsedMs) ?? readNumericMetadata(metadata?.geminiElapsedMs);
  if (explicitElapsed != null) {
    return Math.max(0, explicitElapsed);
  }

  const geminiStarted = readNumericMetadata(metadata?.geminiStarted);
  const geminiCompleted = readNumericMetadata(metadata?.geminiCompleted);
  if (geminiStarted != null && geminiCompleted != null) {
    return Math.max(0, geminiCompleted - geminiStarted);
  }
  if (geminiStarted != null) {
    return Math.max(0, Date.now() - geminiStarted);
  }
  return Math.max(0, Date.now() - fallbackStartedAt);
}

function isTriggerQueued(status: string, metadata: Record<string, unknown> | undefined): boolean {
  if (typeof metadata?.status === 'string' && metadata.status === 'running') {
    return false;
  }
  return status === 'PENDING' || status === 'QUEUED' || status === 'WAITING_FOR_DEPLOY';
}

function buildTriggerProgressNote(
  handle: { description: string },
  status: string | null,
  metadata: Record<string, unknown> | undefined,
  fallbackStartedAt: number
): string {
  const elapsedMs = getTriggerElapsedMs(metadata, fallbackStartedAt);
  const queued =
    (status == null || isTriggerQueued(status, metadata)) &&
    readNumericMetadata(metadata?.geminiStarted) == null;
  if (queued) {
    return elapsedMs >= MAX_WAIT
      ? 'Research is taking longer than expected - still working...'
      : 'Queued';
  }

  const metadataMessage =
    typeof metadata?.agentStatusMessage === 'string' && metadata.agentStatusMessage.trim()
      ? metadata.agentStatusMessage.trim()
      : handle.description;
  const slowSuffix =
    elapsedMs >= MAX_WAIT ? ' Research is taking longer than expected - still working...' : '';
  return `${metadataMessage} (${formatElapsedMs(elapsedMs)} elapsed)${slowSuffix}`;
}

export function useAgentChat(options: UseAgentChatOptions): UseAgentChatResult {
  const { sessionId, depth } = options;

  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [agentsRecord, setAgentsRecord] = useState<Record<string, AgentStatus>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [deepRemaining, setDeepRemaining] = useState(0);
  const [sources, setSources] = useState<Source[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const recoveryInFlightRef = useRef(false);

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

  const clearPendingSessionState = useCallback(() => {
    writePendingSessionState(sessionId, null);
  }, [sessionId]);

  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    clearPendingSessionState();
    setMessages([]);
    setAgentsRecord({});
    setPhase('idle');
    setSources([]);
    setFollowUps([]);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  }, [clearPendingSessionState]);

  const loadSession = useCallback((initial: AgentChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(initial);
    setAgentsRecord({});
    setPhase('idle');
    const lastAssistant = [...initial].reverse().find((m) => m.role === 'assistant');
    setSources(lastAssistant?.sources ?? []);
    setFollowUps(lastAssistant?.followUps ?? []);
    setSessionTitle(null);
    setError(null);
    setIsLoading(false);
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    const hasCompletedAssistant = messages.some(
      (message) => message.role === 'assistant' && message.content.trim().length > 0
    );

    if (hasCompletedAssistant && (phase === 'idle' || phase === 'done')) {
      clearPendingSessionState();
    }
  }, [clearPendingSessionState, messages, phase]);

  const setAssistantContent = useCallback((assistantId: string, content: string) => {
    setMessages((prev) =>
      prev.map((message) => (message.id === assistantId ? { ...message, content } : message))
    );
  }, []);

  const appendAssistantToken = useCallback((assistantId: string, token: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, content: message.content + token }
          : message
      )
    );
  }, []);

  const setAssistantSources = useCallback((assistantId: string, nextSources: Source[]) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, sources: nextSources } : message
      )
    );
  }, []);

  const setAssistantFollowUps = useCallback((assistantId: string, nextFollowUps: string[]) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, followUps: nextFollowUps } : message
      )
    );
  }, []);

  const ensureAssistantMessage = useCallback((assistantId: string) => {
    setMessages((prev) => {
      if (prev.some((message) => message.id === assistantId)) {
        return prev;
      }

      return [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: [],
          followUps: [],
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const finalizeAssistantMessage = useCallback((assistantId: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              content: message.content.replace(/<sources>[\s\S]*?<\/sources>/i, '').trimEnd(),
            }
          : message
      )
    );
  }, []);

  const waitForTriggerRuns = useCallback(
    async (
      handles: PersistedPendingHandle[],
      signal: AbortSignal
    ): Promise<PendingResult[]> => {
      const pending = new Map(handles.map((handle) => [handle.runId, handle]));
      const results: PendingResult[] = [];
      const startedAt = Date.now();

      while (pending.size > 0) {
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const updates = await Promise.all(
          Array.from(pending.values()).map(async (handle) => {
            try {
              const res = await fetch(`/api/agent/status?runId=${encodeURIComponent(handle.runId)}`, {
                signal,
              });
              const data = (await res.json().catch(() => ({}))) as TriggerStatusResponse & {
                error?: string;
              };
              return { handle, ok: res.ok, data };
            } catch (error) {
              return { handle, ok: false, data: null as TriggerStatusResponse | null, error };
            }
          })
        );

        for (const update of updates) {
          const handle = update.handle;

          if ('error' in update && update.error) {
            if ((update.error as Error).name === 'AbortError') {
              throw update.error;
            }
            setAgentsRecord((prev) => ({
              ...prev,
              [handle.toolName]: {
                ...prev[handle.toolName],
                status: prev[handle.toolName]?.status === 'pending' ? 'pending' : 'running',
                summary: buildTriggerProgressNote(handle, null, undefined, startedAt),
              },
            }));
            continue;
          }

          if (!update.ok || !update.data) {
            setAgentsRecord((prev) => ({
              ...prev,
              [handle.toolName]: {
                ...prev[handle.toolName],
                status: prev[handle.toolName]?.status === 'pending' ? 'pending' : 'running',
                summary: buildTriggerProgressNote(handle, null, update.data?.metadata, startedAt),
              },
            }));
            continue;
          }

          const status = update.data.status ?? 'UNKNOWN';
          const taskMetadata = update.data.metadata as TriggerTaskMetadata | undefined;
          const progressNote = buildTriggerProgressNote(handle, status, taskMetadata, startedAt);
          const queued = isTriggerQueued(status, taskMetadata);

          if (status !== 'COMPLETED' && !TERMINAL_TRIGGER_FAILURES.has(status)) {
            setAgentsRecord((prev) => ({
              ...prev,
              [handle.toolName]: {
                ...prev[handle.toolName],
                status: queued ? 'pending' : 'running',
                summary: progressNote,
              },
            }));
          }

          if (status === 'COMPLETED') {
            const output = update.data.output;
            const success = Boolean(output?.success);
            const sources = output?.sources ?? [];
            const elapsedMs = getTriggerElapsedMs(taskMetadata, startedAt);
            const errorMessage = success
              ? undefined
              : sanitizeClientErrorMessage(output?.error ?? update.data.error ?? 'Research task failed');

            results.push({
              name: handle.toolName,
              success,
              content: output?.content ?? null,
              sources,
              error: errorMessage,
            });
            pending.delete(handle.runId);
            setAgentsRecord((prev) => ({
              ...prev,
              [handle.toolName]: {
                ...prev[handle.toolName],
                status: success ? 'complete' : 'error',
                summary: success ? `Done in ${formatElapsedMs(elapsedMs)}` : undefined,
                error: errorMessage,
                sources,
              },
            }));
            continue;
          }

          if (TERMINAL_TRIGGER_FAILURES.has(status)) {
            const message = sanitizeClientErrorMessage(
              update.data.error ?? 'Research task failed'
            );
            results.push({
              name: handle.toolName,
              success: false,
              content: null,
              sources: [],
              error: message,
            });
            pending.delete(handle.runId);
            setAgentsRecord((prev) => ({
              ...prev,
              [handle.toolName]: {
                ...prev[handle.toolName],
                status: 'error',
                error: message,
              },
            }));
          }
        }

        if (pending.size > 0) {
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      return results;
    },
    []
  );

  const endpointFor = useCallback((toolName: string): string => {
    const map: Record<string, string> = {
      screen_stocks: '/api/agent/screen',
      analyze_stock: '/api/agent/analyze',
      brief_market: '/api/agent/brief',
      check_portfolio: '/api/agent/portfolio',
      log_trade: '/api/agent/log-trade',
    };
    return map[toolName] ?? '/api/agent/screen';
  }, []);

  const labelFor = useCallback((call: { name: string; arguments?: Record<string, unknown> }): string => {
    const args = call.arguments;
    const labels: Record<string, string> = {
      screen_stocks: 'Screening stocks',
      analyze_stock: `Analyzing ${String(args?.ticker ?? 'stock')}`,
      brief_market: 'Briefing market',
      check_portfolio: 'Checking portfolio',
      log_trade: 'Logging trade',
    };
    return labels[call.name] ?? call.name;
  }, []);

  const classify = useCallback((toolName: string): AgentName => {
    switch (toolName) {
      case 'screen_stocks': return 'screen';
      case 'analyze_stock': return 'analyze';
      case 'brief_market': return 'brief';
      case 'log_trade': return 'trade_log';
      case 'check_portfolio':
      default: return 'portfolio';
    }
  }, []);

  const buildFallbackContent = useCallback(
    (results: PendingResult[]) =>
      results
        .filter((result) => result.success && result.content)
        .map(
          (result) => `### ${labelFor({ name: result.name, arguments: {} })}\n\n${result.content}`
        )
        .join('\n\n---\n\n'),
    [labelFor]
  );

  const restoreAgentStatuses = useCallback(
    (directResults: PendingResult[], triggerHandles: PersistedPendingHandle[]) => {
      const nextAgents: Record<string, AgentStatus> = {};

      for (const result of directResults) {
        nextAgents[result.name] = {
          name: classify(result.name),
          description: labelFor({ name: result.name, arguments: {} }),
          status: result.success ? 'complete' : 'error',
          summary: result.success ? 'Done' : undefined,
          error: result.success ? undefined : result.error,
          sources: result.sources,
        };
      }

      for (const handle of triggerHandles) {
        if (nextAgents[handle.toolName]) continue;
        nextAgents[handle.toolName] = {
          name: classify(handle.toolName),
          description: handle.description,
          status: 'pending',
          summary: 'Queued',
          sources: [],
        };
      }

      setAgentsRecord(nextAgents);
    },
    [classify, labelFor]
  );

  const runSynthesis = useCallback(
    async (
      assistantId: string,
      results: PendingResult[],
      context: Record<string, unknown>,
      signal: AbortSignal
    ): Promise<void> => {
      const successful = results.filter((result) => result.success);

      setPhase('synthesizing');
      setIsStreaming(true);
      setIsLoading(true);

      const synthRes = await fetch('/api/agent/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results, context }),
        signal,
      });

      if (!synthRes.ok || !synthRes.body) {
        setAssistantContent(assistantId, buildFallbackContent(successful));
        finalizeAssistantMessage(assistantId);
        setPhase('done');
        setIsStreaming(false);
        setIsLoading(false);
        clearPendingSessionState();
        return;
      }

      const reader = synthRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6)) as Record<string, unknown>;

            if (event.type === 'token' && typeof event.token === 'string') {
              appendAssistantToken(assistantId, event.token);
            } else if (event.type === 'sources' && Array.isArray(event.sources)) {
              const nextSources = event.sources
                .map(sanitizeSource)
                .filter((source): source is Source => source !== null);
              setSources(nextSources);
              setAssistantSources(assistantId, nextSources);
            } else if (event.type === 'follow_ups' && Array.isArray(event.followUps)) {
              const nextFollowUps = event.followUps.filter(
                (followUp): followUp is string => typeof followUp === 'string'
              );
              setFollowUps(nextFollowUps);
              setAssistantFollowUps(assistantId, nextFollowUps);
            } else if (event.type === 'error' && typeof event.message === 'string') {
              setError(event.message);
            }
          } catch {}
        }
      }

      finalizeAssistantMessage(assistantId);
      setPhase('done');
      setIsStreaming(false);
      setIsLoading(false);
      clearPendingSessionState();
    },
    [
      appendAssistantToken,
      buildFallbackContent,
      clearPendingSessionState,
      finalizeAssistantMessage,
      setAssistantContent,
      setAssistantFollowUps,
      setAssistantSources,
    ]
  );

  const resumePendingSession = useCallback(() => {
    if (recoveryInFlightRef.current) return;

    const pendingState = readPendingSessionState(sessionId);
    if (!pendingState) return;

    recoveryInFlightRef.current = true;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    ensureAssistantMessage(pendingState.assistantId);
    restoreAgentStatuses(pendingState.directResults, pendingState.triggerHandles);
    setError(null);
    setIsLoading(true);
    setIsStreaming(false);
    setSources([]);
    setFollowUps([]);

    void (async () => {
      try {
        let results = pendingState.results;

        if (pendingState.phase === 'researching') {
          setPhase('researching');
          const triggerResults =
            pendingState.triggerHandles.length > 0
              ? await waitForTriggerRuns(pendingState.triggerHandles, controller.signal)
              : [];

          results = [...pendingState.directResults, ...triggerResults];
          if (results.every((result) => !result.success)) {
            clearPendingSessionState();
            setError('All research agents failed. Please try again.');
            setPhase('done');
            setIsLoading(false);
            return;
          }

          writePendingSessionState(sessionId, {
            version: PENDING_SESSION_VERSION,
            phase: 'synthesizing',
            assistantId: pendingState.assistantId,
            context: pendingState.context,
            directResults: [],
            triggerHandles: [],
            results,
          });
        }

        if (results.length === 0) {
          clearPendingSessionState();
          setPhase('done');
          setIsLoading(false);
          return;
        }

        await runSynthesis(pendingState.assistantId, results, pendingState.context, controller.signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAgentChat] failed to resume pending session:', err);
        setError(
          sanitizeClientErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
        );
        setPhase('done');
        setIsStreaming(false);
        setIsLoading(false);
      } finally {
        recoveryInFlightRef.current = false;
      }
    })();
  }, [
    clearPendingSessionState,
    ensureAssistantMessage,
    restoreAgentStatuses,
    runSynthesis,
    sessionId,
    waitForTriggerRuns,
  ]);

  const doSend = useCallback(
    async (messageText: string): Promise<void> => {
      abortRef.current?.abort();
      recoveryInFlightRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;

      clearPendingSessionState();
      setError(null);
      setIsLoading(true);
      setIsStreaming(false);
      setPhase('orchestrating');
      setSources([]);
      setFollowUps([]);

      const userMsg: AgentChatMessage = {
        id: genId(),
        role: 'user',
        content: messageText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const assistantId = genId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          sources: [],
          followUps: [],
          createdAt: new Date().toISOString(),
        },
      ]);

      try {
        // === STEP 1: Orchestrate ===
        const orchRes = await fetch('/api/agent/orchestrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: messageText, sessionId }),
          signal: controller.signal,
        });
        if (!orchRes.ok) throw new Error('Orchestration failed');
        const { toolCalls, directReply, context } = await orchRes.json();

        // If orchestrator answered directly (no tools), we're done
        if (directReply && toolCalls.length === 0) {
          setAssistantContent(assistantId, directReply);
          setPhase('done');
          setIsLoading(false);
          return;
        }

        // === STEP 2: Research (parallel agents) ===
        setPhase('researching');

        const initialAgents: Record<string, AgentStatus> = {};
        for (const call of toolCalls) {
          initialAgents[call.name] = { 
            name: classify(call.name),
            description: labelFor(call),
            status: 'running', 
            sources: [] 
          };
        }
        setAgentsRecord(initialAgents);

        const agentResponses = await Promise.all(toolCalls.map(async (call: { name: string, arguments: Record<string, unknown> }) => {
          const endpoint = endpointFor(call.name);
          try {
            const res = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ args: call.arguments, context, deep: depth === 'deep' }),
              signal: controller.signal,
            });

            const result = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(
                typeof result?.error === 'string' ? result.error : 'Agent execution failed'
              );
            }

            if (isTriggerHandleResponse(result)) {
              setAgentsRecord((prev) => ({
                ...prev,
                [call.name]: {
                  name: classify(call.name),
                  status: 'pending',
                  description: labelFor(call),
                  summary: 'Queued',
                  sources: [],
                },
              }));

              return {
                kind: 'trigger' as const,
                handle: {
                  ...result,
                  toolName: call.name,
                  description: labelFor(call),
                },
              };
            }

            const directResult = result as DirectAgentResponse;
            const success = Boolean(directResult.success);

            setAgentsRecord((prev) => ({
              ...prev,
              [call.name]: {
                name: classify(call.name),
                status: success ? 'complete' : 'error',
                description: labelFor(call),
                summary: success ? 'Done' : undefined,
                error: success ? undefined : directResult.error,
                sources: directResult.sources ?? [],
              },
            }));

            return {
              kind: 'direct' as const,
              result: {
                name: call.name,
                success,
                content: directResult.content ?? null,
                sources: directResult.sources ?? [],
                error: directResult.error,
              },
            };
          } catch (err) {
            const message = sanitizeClientErrorMessage(
              err instanceof Error ? err.message : 'Agent execution failed'
            );
            setAgentsRecord((prev) => ({
              ...prev,
              [call.name]: { ...prev[call.name], status: 'error', error: message },
            }));
            return {
              kind: 'direct' as const,
              result: {
                name: call.name,
                success: false,
                content: null,
                sources: [],
                error: message,
              },
            };
          }
        }));

        const directResults = agentResponses
          .filter((response): response is Extract<typeof response, { kind: 'direct' }> => response.kind === 'direct')
          .map((response) => response.result);
        const triggerHandles = agentResponses
          .filter((response): response is Extract<typeof response, { kind: 'trigger' }> => response.kind === 'trigger')
          .map((response) => ({
            runId: response.handle.runId,
            toolName: response.handle.toolName,
            description: response.handle.description,
          }));

        writePendingSessionState(sessionId, {
          version: PENDING_SESSION_VERSION,
          phase: 'researching',
          assistantId,
          context,
          directResults,
          triggerHandles,
          results: [],
        });

        const triggerResults =
          triggerHandles.length > 0
            ? await waitForTriggerRuns(triggerHandles, controller.signal)
            : [];

        const results = [...directResults, ...triggerResults];
        const successful = results.filter((r) => r.success);

        if (successful.length === 0) {
          clearPendingSessionState();
          setError('All research agents failed. Please try again.');
          setPhase('done');
          setIsLoading(false);
          return;
        }

        writePendingSessionState(sessionId, {
          version: PENDING_SESSION_VERSION,
          phase: 'synthesizing',
          assistantId,
          context,
          directResults: [],
          triggerHandles: [],
          results,
        });

        await runSynthesis(assistantId, results, context, controller.signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[useAgentChat] pipeline failed:', err);
        clearPendingSessionState();
        setError(sanitizeClientErrorMessage(err instanceof Error ? err.message : 'Something went wrong'));
        setPhase('done');
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [
      classify,
      clearPendingSessionState,
      depth,
      endpointFor,
      labelFor,
      runSynthesis,
      sessionId,
      setAssistantContent,
      waitForTriggerRuns,
    ]
  );

  const sendMessage = useCallback(
    async (messageText: string): Promise<void> => {
      const trimmed = messageText.trim();
      if (!trimmed) return;
      await doSend(trimmed);
    },
    [doSend]
  );

  return {
    messages,
    agentStatuses: Object.values(agentsRecord),
    isLoading,
    isStreaming,
    deepRemaining,
    sources,
    followUps,
    sessionTitle,
    error,
    phase,
    sendMessage,
    resetSession,
    loadSession,
    resumePendingSession,
  };
}
