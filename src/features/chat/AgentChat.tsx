'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, BarChart3, Newspaper, Wallet } from 'lucide-react';
import type { ChatMessage } from '@/types/chat';
import type { Position } from '@/types/portfolio';
import {
  useAgentChat,
  type AgentStatus as HookAgentStatus,
  type AgentChatMessage,
  type Source,
} from '@/lib/agents/use-agent-chat';
import type { AgentName } from '@/lib/agents/types';
import { useAlerts } from '@/lib/alerts/use-alerts';
import { AlertBanner } from '@/features/alerts/AlertBanner';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SuggestionChips, getDefaultSuggestions } from './SuggestionChips';
import { AgentStatusCard, type AgentStatus as UIAgentStatus } from './AgentStatusCard';
import { SourceRail } from './SourceRail';
import { TradeChecklist } from './TradeChecklist';

interface AgentChatProps {
  sessionId: string;
  initialMessages?: ChatMessage[];
  positions: Position[];
  watchlist?: { ticker: string }[];
  onSessionTitle?: (title: string) => void;
  queuedPrompt?: string;
  queuedPromptId?: number;
}

const AGENT_ICONS: Record<AgentName, typeof Search> = {
  screen: Search,
  analyze: BarChart3,
  brief: Newspaper,
  portfolio: Wallet,
  trade_log: Wallet,
};

const AGENT_LABELS: Record<AgentName, string> = {
  screen: 'Stock Screener',
  analyze: 'Fundamentals Agent',
  brief: 'Market Brief',
  portfolio: 'Portfolio Agent',
  trade_log: 'Trade Logger',
};

function sessionDraftKey(sessionId: string): string {
  return `cerna-agent-chat:${sessionId}`;
}

function parseDraftState(raw: string | null): {
  messages: AgentChatMessage[];
  persistedIds: string[];
} {
  if (!raw) return { messages: [], persistedIds: [] };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const rawMessages = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' &&
          parsed !== null &&
          Array.isArray((parsed as { messages?: unknown }).messages)
        ? (parsed as { messages: unknown[] }).messages
        : [];
    const persistedIds =
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { persistedIds?: unknown }).persistedIds)
        ? (parsed as { persistedIds: unknown[] }).persistedIds.filter(
            (value): value is string => typeof value === 'string'
          )
        : [];

    const messages = rawMessages
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .filter(
        (item) =>
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          typeof item.createdAt === 'string' &&
          typeof item.id === 'string'
      )
      .map((item) => ({
        id: item.id as string,
        role: item.role as 'user' | 'assistant',
        content: item.content as string,
        createdAt: item.createdAt as string,
        sources: Array.isArray(item.sources)
          ? item.sources
              .filter(
                (source): source is Record<string, unknown> =>
                  typeof source === 'object' && source !== null
              )
              .map((source) => ({
                title: typeof source.title === 'string' ? source.title : '',
                url: typeof source.url === 'string' ? source.url : '',
                domain: typeof source.domain === 'string' ? source.domain : '',
                snippet: typeof source.snippet === 'string' ? source.snippet : undefined,
              }))
              .filter((source) => source.url)
          : [],
        followUps: Array.isArray(item.followUps)
          ? item.followUps.filter((followUp): followUp is string => typeof followUp === 'string')
          : [],
      }));
    return { messages, persistedIds };
  } catch {
    return { messages: [], persistedIds: [] };
  }
}

function normalizeCitation(citation: {
  title?: string;
  url: string;
  domain?: string;
  snippet?: string;
}): Source {
  return {
    title: citation.title ?? '',
    url: citation.url,
    domain:
      citation.domain ??
      (() => {
        try {
          return new URL(citation.url).hostname.replace(/^www\./, '');
        } catch {
          return citation.url;
        }
      })(),
    snippet: citation.snippet,
  };
}

function chatMessageToAgent(message: ChatMessage): AgentChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.created_at,
    sources: (message.citations ?? []).map((citation) => normalizeCitation(citation)),
  };
}

function sanitizeAgentStatusNote(note?: string): string | undefined {
  if (!note) return undefined;
  if (
    /Gemini/i.test(note) ||
    /^\s*\d{3}\b/.test(note) ||
    /request failed \(\d+\)/i.test(note)
  ) {
    return 'Temporary error - retrying...';
  }
  return note;
}

function hookStatusToUi(status: HookAgentStatus): UIAgentStatus {
  const state = status.status;
  const completionNote =
    status.status === 'error' ? sanitizeAgentStatusNote(status.error) : status.summary;

  return {
    id: status.name,
    name: AGENT_LABELS[status.name],
    description: status.description,
    Icon: AGENT_ICONS[status.name],
    state,
    completionNote,
    sources: status.sources,
  };
}

function extractElapsed(note?: string): string | null {
  if (!note) return null;
  const match = note.match(/\(([^()]*elapsed)\)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

export function AgentChat({
  sessionId,
  initialMessages = [],
  positions,
  watchlist = [],
  onSessionTitle,
  queuedPrompt,
  queuedPromptId,
}: AgentChatProps) {
  const [depth, setDepth] = useState<'standard' | 'deep'>('standard');
  const {
    messages,
    agentStatuses,
    isLoading,
    isStreaming,
    deepRemaining,
    sessionTitle,
    error,
    phase,
    tradeCheckState,
    sendMessage,
    loadSession,
    resumePendingSession,
  } = useAgentChat({ sessionId, depth });

  const { alerts, dismissAlert, markRead } = useAlerts();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastSentRef = useRef<string>('');
  const lastQueuedPromptIdRef = useRef<number | undefined>(undefined);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const persistenceInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    persistedMessageIdsRef.current = new Set();
    persistenceInFlightRef.current = new Set();

    const historyMessages = initialMessages.map(chatMessageToAgent);
    if (historyMessages.length > 0) {
      persistedMessageIdsRef.current = new Set(historyMessages.map((message) => message.id));
      window.sessionStorage.removeItem(sessionDraftKey(sessionId));
      loadSession(historyMessages);
      const hasCompletedAssistant = historyMessages.some(
        (message) => message.role === 'assistant' && message.content.trim().length > 0
      );
      if (!hasCompletedAssistant) {
        resumePendingSession();
      }
      return;
    }

    const draftState = parseDraftState(window.sessionStorage.getItem(sessionDraftKey(sessionId)));
    persistedMessageIdsRef.current = new Set(draftState.persistedIds);
    if (draftState.messages.length > 0) {
      loadSession(draftState.messages);
      resumePendingSession();
      return;
    }

    loadSession([]);
    resumePendingSession();
  }, [initialMessages, loadSession, resumePendingSession, sessionId]);

  useEffect(() => {
    const key = sessionDraftKey(sessionId);
    if (messages.length === 0) {
      window.sessionStorage.removeItem(key);
      return;
    }

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        messages,
        persistedIds: Array.from(persistedMessageIdsRef.current),
      })
    );
  }, [messages, sessionId]);

  useEffect(() => {
    const unsavedMessages = messages.filter((message) => {
      if (persistedMessageIdsRef.current.has(message.id)) return false;
      if (persistenceInFlightRef.current.has(message.id)) return false;
      if (message.role === 'user') return message.content.trim().length > 0;
      return (
        message.content.trim().length > 0 &&
        phase === 'done' &&
        !isLoading &&
        !isStreaming &&
        error == null
      );
    });

    if (unsavedMessages.length === 0) return;

    unsavedMessages.forEach((message) => persistenceInFlightRef.current.add(message.id));

    void fetch(`/api/sessions/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: unsavedMessages.map((message) => ({
          role: message.role,
          content: message.content,
          citations:
            message.role === 'assistant'
              ? (message.sources ?? []).map((source) => ({
                  url: source.url,
                  title: source.title,
                  domain: source.domain,
                  snippet: source.snippet,
                }))
              : [],
        })),
      }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to persist chat session');
        }
        unsavedMessages.forEach((message) => {
          persistenceInFlightRef.current.delete(message.id);
          persistedMessageIdsRef.current.add(message.id);
        });
        window.sessionStorage.setItem(
          sessionDraftKey(sessionId),
          JSON.stringify({
            messages,
            persistedIds: Array.from(persistedMessageIdsRef.current),
          })
        );
      })
      .catch(() => {
        unsavedMessages.forEach((message) => {
          persistenceInFlightRef.current.delete(message.id);
        });
      });
  }, [messages, phase, isLoading, isStreaming, error, sessionId]);

  useEffect(() => {
    if (sessionTitle && onSessionTitle) onSessionTitle(sessionTitle);
  }, [sessionTitle, onSessionTitle]);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, agentStatuses, autoScroll, scrollToBottom]);

  function onScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    setAutoScroll(atBottom);
  }

  const suggestions = useMemo(
    () => getDefaultSuggestions(positions, watchlist),
    [positions, watchlist]
  );

  const researchProgress = useMemo(() => {
    const totalAgents = agentStatuses.length;
    const completedAgents = agentStatuses.filter(
      (status) => status.status === 'complete' || status.status === 'error'
    ).length;
    const runningStatus = agentStatuses.find((status) => status.status === 'running');
    const pendingCount = agentStatuses.filter((status) => status.status === 'pending').length;

    if (phase === 'orchestrating') {
      return {
        title: 'Planning research',
        subtitle: 'Choosing which specialist agents to run.',
        elapsed: null as string | null,
      };
    }

    if (phase === 'researching') {
      return {
        title:
          completedAgents === 0
            ? `Research in progress (${totalAgents} agent${totalAgents === 1 ? '' : 's'})`
            : `Research in progress (${completedAgents}/${totalAgents} complete)`,
        subtitle:
          runningStatus?.summary ??
          (pendingCount > 0 ? `${pendingCount} queued` : 'Searching, analyzing, and preparing findings.'),
        elapsed: extractElapsed(runningStatus?.summary),
      };
    }

    if (phase === 'synthesizing') {
      return {
        title: 'Writing final answer',
        subtitle: 'Combining the specialist findings into one response.',
        elapsed: null as string | null,
      };
    }

    return null;
  }, [agentStatuses, phase]);

  const handleSend = useCallback(
    async (text: string, sendDepth: 'standard' | 'deep') => {
      setDepth(sendDepth);
      lastSentRef.current = text;
      setAutoScroll(true);
      await sendMessage(text);
    },
    [sendMessage]
  );

  const handleAlertAsk = useCallback(
    (message: string) => {
      void handleSend(message, depth);
    },
    [handleSend, depth]
  );

  useEffect(() => {
    if (!queuedPrompt || queuedPromptId == null) return;
    if (lastQueuedPromptIdRef.current === queuedPromptId) return;
    lastQueuedPromptIdRef.current = queuedPromptId;

    const timeoutId = window.setTimeout(() => {
      void handleSend(queuedPrompt, depth);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [depth, handleSend, queuedPrompt, queuedPromptId]);

  const retry = useCallback(() => {
    if (lastSentRef.current) void sendMessage(lastSentRef.current);
  }, [sendMessage]);

  const isEmpty = messages.length === 0 && phase === 'idle' && !isStreaming && !isLoading;
  const showAgentCards = agentStatuses.length > 0 && phase !== 'idle' && phase !== 'done';

  return (
    <div className="flex h-full flex-col">
      <AlertBanner
        alerts={alerts}
        onDismiss={dismissAlert}
        onMarkRead={markRead}
        onAskAbout={handleAlertAsk}
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ scrollPaddingBottom: '14rem' }}
      >
        {isEmpty ? (
          <div className="flex min-h-full items-center justify-center px-4 py-10">
            <div className="w-full max-w-[640px]">
              <h1 className="text-[28px] font-semibold tracking-tight text-cerna-text-primary">
                What do you want to research?
              </h1>
              <p className="mt-2 text-[15px] text-[rgba(255,255,255,0.5)]">
                I can screen stocks, analyze companies, brief you on markets, and check your
                portfolio.
              </p>
              <div className="mt-6">
                <SuggestionChips
                  suggestions={suggestions}
                  onSelect={(suggestion) => void handleSend(suggestion, depth)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            className="mx-auto max-w-[var(--chat-max-width)] space-y-6 px-4 py-6"
            style={{ paddingBottom: 'calc(14rem + env(safe-area-inset-bottom))' }}
          >
            {messages.map((message, index) => {
              const isLastAssistant =
                message.role === 'assistant' && index === messages.length - 1;
              const showShimmer = isLastAssistant && message.content.length === 0;

              return (
                <div key={message.id} className="space-y-3">
                  {isLastAssistant && showAgentCards && (
                    <div className="space-y-2">
                      {researchProgress && (
                        <div
                          className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 animate-agent-slide-in"
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            borderColor: 'rgba(255,255,255,0.08)',
                            backdropFilter: 'blur(12px)',
                          }}
                        >
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-cerna-text-primary">
                              {researchProgress.title}
                            </div>
                            <div className="mt-1 text-[12px] leading-5 text-[rgba(255,255,255,0.45)]">
                              {researchProgress.subtitle}
                            </div>
                          </div>
                          {researchProgress.elapsed && (
                            <span className="shrink-0 rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[11px] font-medium text-[rgba(255,255,255,0.58)]">
                              {researchProgress.elapsed}
                            </span>
                          )}
                        </div>
                      )}
                      {agentStatuses.map((status) => (
                        <AgentStatusCard key={status.name} status={hookStatusToUi(status)} />
                      ))}
                    </div>
                  )}

                  {showShimmer ? (
                    <div className="w-full">
                      <div className="h-4 w-2/3 animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
                      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-[rgba(255,255,255,0.06)]" />
                    </div>
                  ) : (
                    <MessageBubble
                      messageId={message.id}
                      role={message.role}
                      content={message.content}
                      createdAt={message.createdAt}
                    />
                  )}

                  {message.role === 'assistant' && (message.sources?.length ?? 0) > 0 && (
                    <SourceRail
                      messageId={message.id}
                      sources={(message.sources ?? []).map((source) => normalizeCitation(source))}
                    />
                  )}

                  {message.role === 'assistant' &&
                    isLastAssistant &&
                    !isStreaming &&
                    (message.followUps?.length ?? 0) > 0 && (
                      <div>
                        <div className="mb-2 text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)]">
                          Follow up
                        </div>
                        <SuggestionChips
                          suggestions={message.followUps ?? []}
                          onSelect={(suggestion) => void handleSend(suggestion, depth)}
                          layout="inline"
                        />
                      </div>
                    )}
                </div>
              );
            })}

            {tradeCheckState && (
              <TradeChecklist state={tradeCheckState} />
            )}

            {error && (
              <div
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
                style={{
                  borderColor: 'rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)',
                }}
              >
                <p className="text-[13px] text-cerna-loss">Something went wrong. Please try again.</p>
                {lastSentRef.current && (
                  <button
                    type="button"
                    onClick={retry}
                    className="shrink-0 text-[12px] text-cerna-primary hover:underline"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/96 to-transparent pt-4 backdrop-blur-sm">
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || isLoading}
          placeholder={
            tradeCheckState?.active
              ? 'Continue, challenge, ask a question, resize, or say stop...'
              : 'Ask anything about your portfolio...'
          }
          depth={depth}
          onDepthChange={setDepth}
          deepRemaining={deepRemaining}
        />
      </div>
    </div>
  );
}
