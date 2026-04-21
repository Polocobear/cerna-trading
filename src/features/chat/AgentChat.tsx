'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, BarChart3, Newspaper, Wallet } from 'lucide-react';
import type { ChatMessage } from '@/types/chat';
import type { Position } from '@/types/portfolio';
import { useAgentChat, type AgentStatus as HookAgentStatus, type AgentChatMessage } from '@/lib/agents/use-agent-chat';
import type { AgentName } from '@/lib/agents/types';
import { CitationCard } from './CitationCard';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SuggestionChips, getDefaultSuggestions } from './SuggestionChips';
import { AgentStatusCard, type AgentStatus as UIAgentStatus } from './AgentStatusCard';

interface AgentChatProps {
  sessionId: string;
  initialMessages?: ChatMessage[];
  positions: Position[];
  watchlist?: { ticker: string }[];
  onSessionTitle?: (title: string) => void;
}

const AGENT_ICONS: Record<AgentName, typeof Search> = {
  screen: Search,
  analyze: BarChart3,
  brief: Newspaper,
  portfolio: Wallet,
};

const AGENT_LABELS: Record<AgentName, string> = {
  screen: 'ASX Screener',
  analyze: 'Fundamentals Agent',
  brief: 'Market Brief',
  portfolio: 'Portfolio Agent',
};

function chatMessageToAgent(m: ChatMessage): AgentChatMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    sources: (m.citations ?? []).map((c) => ({
      title: c.title ?? '',
      url: c.url,
      domain: c.domain ?? (() => {
        try {
          return new URL(c.url).hostname.replace(/^www\./, '');
        } catch {
          return c.url;
        }
      })(),
    })),
  };
}

function hookStatusToUi(s: HookAgentStatus): UIAgentStatus {
  // AgentStatusCard only knows 'running' | 'complete' — collapse pending→running for visual simplicity,
  // and error→complete with an error note.
  const state: 'running' | 'complete' = s.status === 'complete' || s.status === 'error' ? 'complete' : 'running';
  const completionNote =
    s.status === 'error'
      ? s.error
      : s.status === 'complete'
      ? s.summary
      : undefined;
  return {
    id: s.name,
    name: AGENT_LABELS[s.name],
    description: s.description,
    Icon: AGENT_ICONS[s.name],
    state,
    completionNote,
  };
}

export function AgentChat({ sessionId, initialMessages = [], positions, watchlist = [], onSessionTitle }: AgentChatProps) {
  const [depth, setDepth] = useState<'standard' | 'deep'>('standard');
  const {
    messages,
    agentStatuses,
    isLoading,
    isStreaming,
    deepRemaining,
    sessionTitle,
    error,
    sendMessage,
    loadSession,
  } = useAgentChat({ sessionId, depth });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const lastSentRef = useRef<string>('');

  // When initialMessages arrive (session loaded from history), push them into the hook.
  useEffect(() => {
    loadSession(initialMessages.map(chatMessageToAgent));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Relay session titles up (for history sidebar refresh).
  useEffect(() => {
    if (sessionTitle && onSessionTitle) onSessionTitle(sessionTitle);
  }, [sessionTitle, onSessionTitle]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, agentStatuses, autoScroll, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  }

  const suggestions = useMemo(
    () => getDefaultSuggestions(positions, watchlist),
    [positions, watchlist]
  );

  const handleSend = useCallback(
    async (text: string, sendDepth: 'standard' | 'deep') => {
      setDepth(sendDepth);
      lastSentRef.current = text;
      setAutoScroll(true);
      await sendMessage(text);
    },
    [sendMessage]
  );

  const retry = useCallback(() => {
    if (lastSentRef.current) void sendMessage(lastSentRef.current);
  }, [sendMessage]);

  const isEmpty = messages.length === 0 && !isStreaming && !isLoading;

  // Agent cards visible while we have statuses and any are not yet complete/error.
  const showAgentCards =
    agentStatuses.length > 0 &&
    agentStatuses.some((s) => s.status !== 'complete' && s.status !== 'error');
  const allComplete =
    agentStatuses.length > 0 && agentStatuses.every((s) => s.status === 'complete' || s.status === 'error');

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto custom-scrollbar">
        {isEmpty ? (
          <div className="min-h-full flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-[640px]">
              <h1 className="text-[28px] font-semibold text-cerna-text-primary tracking-tight">
                What do you want to research?
              </h1>
              <p className="text-[15px] text-[rgba(255,255,255,0.5)] mt-2">
                I can screen stocks, analyze companies, brief you on markets, and check your portfolio.
              </p>
              <div className="mt-6">
                <SuggestionChips
                  suggestions={suggestions}
                  onSelect={(s) => void handleSend(s, depth)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[var(--chat-max-width)] px-4 py-6 space-y-6">
            {messages.map((m, idx) => {
              const isLastAssistant =
                m.role === 'assistant' && idx === messages.length - 1;
              const showShimmer = isLastAssistant && m.content.length === 0;
              return (
                <div key={m.id} className="space-y-3">
                  {/* Agent cards appear directly above the current streaming assistant msg. */}
                  {isLastAssistant && (showAgentCards || (allComplete && isStreaming)) && (
                    <div className="space-y-2">
                      {agentStatuses.map((s) => (
                        <AgentStatusCard key={s.name} status={hookStatusToUi(s)} />
                      ))}
                    </div>
                  )}

                  {showShimmer ? (
                    <div className="w-full">
                      <div className="h-4 w-2/3 rounded bg-[rgba(255,255,255,0.06)] animate-pulse" />
                      <div className="h-4 w-1/2 rounded bg-[rgba(255,255,255,0.06)] animate-pulse mt-2" />
                    </div>
                  ) : (
                    <MessageBubble role={m.role} content={m.content} createdAt={m.createdAt} />
                  )}

                  {m.role === 'assistant' && (m.sources?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)] mb-2">
                        Sources
                      </div>
                      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 snap-x">
                        {m.sources!.map((s, i) => (
                          <div key={s.url + i} className="snap-start">
                            <CitationCard
                              citation={{ url: s.url, title: s.title, domain: s.domain }}
                              index={i}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.role === 'assistant' &&
                    isLastAssistant &&
                    !isStreaming &&
                    (m.followUps?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)] mb-2">
                          Follow up
                        </div>
                        <SuggestionChips
                          suggestions={m.followUps!}
                          onSelect={(s) => void handleSend(s, depth)}
                          layout="inline"
                        />
                      </div>
                    )}
                </div>
              );
            })}

            {/* If agents started but no assistant placeholder has been created yet, render them here. */}
            {agentStatuses.length > 0 &&
              !messages.some((m) => m.role === 'assistant') && (
                <div className="space-y-2">
                  {agentStatuses.map((s) => (
                    <AgentStatusCard key={s.name} status={hookStatusToUi(s)} />
                  ))}
                </div>
              )}

            {error && (
              <div
                className="rounded-lg p-3 border flex items-start justify-between gap-3"
                style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)' }}
              >
                <div className="text-[13px] text-cerna-loss">
                  Something went wrong. {error}
                </div>
                {lastSentRef.current && (
                  <button
                    onClick={retry}
                    className="text-[12px] text-cerna-primary hover:underline shrink-0"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 pt-2">
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || isLoading}
          depth={depth}
          onDepthChange={setDepth}
          deepRemaining={deepRemaining}
        />
      </div>
    </div>
  );
}
