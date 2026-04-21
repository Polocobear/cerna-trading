'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Search, BarChart3, Newspaper, Wallet } from 'lucide-react';
import type { ChatMessage, Citation, Mode } from '@/types/chat';
import type { Position } from '@/types/portfolio';
import { CitationCard } from './CitationCard';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { SuggestionChips } from './SuggestionChips';
import { AgentStatusCard, type AgentStatus } from './AgentStatusCard';
import { ActionBlock } from './ActionBlock';

interface AgentChatProps {
  sessionId: string;
  mode: Mode;
  initialMessages?: ChatMessage[];
  positions: Position[];
}

type Status = 'idle' | 'agents' | 'streaming' | 'done' | 'error';

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  citations?: Citation[];
}

const ACTION_BLOCK_REGEX = /<action-block>([\s\S]*?)<\/action-block>/g;

function toLocal(m: ChatMessage): LocalMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    citations: m.citations ?? undefined,
  };
}

function baseSuggestions(hasPositions: boolean, topHolding?: string): string[] {
  const base = [
    "What's moving on ASX today?",
    'Screen for dividend stocks',
    'Analyze CBA fundamentals',
    "How's my portfolio looking?",
  ];
  if (hasPositions && topHolding) {
    return [
      `Should I hold ${topHolding}?`,
      'Screen for dividend stocks',
      'Analyze CBA fundamentals',
      "How's my portfolio looking?",
    ];
  }
  return base;
}

function mockAgentsForMode(mode: Mode): AgentStatus[] {
  if (mode === 'screen') {
    return [
      { id: 'screener', name: 'ASX Screener', description: 'Scanning ASX-listed equities…', Icon: Search, state: 'running' },
    ];
  }
  if (mode === 'analyze') {
    return [
      { id: 'analyst', name: 'Fundamentals Agent', description: 'Gathering financial data…', Icon: BarChart3, state: 'running' },
    ];
  }
  if (mode === 'brief') {
    return [
      { id: 'brief', name: 'Morning Brief', description: 'Scanning overnight news…', Icon: Newspaper, state: 'running' },
    ];
  }
  if (mode === 'portfolio') {
    return [
      { id: 'portfolio', name: 'Portfolio Agent', description: 'Analyzing your holdings…', Icon: Wallet, state: 'running' },
    ];
  }
  return [
    { id: 'research', name: 'Research Agent', description: 'Searching sources…', Icon: Search, state: 'running' },
  ];
}

export function AgentChat({ sessionId, mode, initialMessages = [], positions }: AgentChatProps) {
  const [messages, setMessages] = useState<LocalMessage[]>(initialMessages.map(toLocal));
  const [status, setStatus] = useState<Status>('idle');
  const [streamText, setStreamText] = useState('');
  const [streamCitations, setStreamCitations] = useState<Citation[]>([]);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(initialMessages.map(toLocal));
  }, [initialMessages]);

  const topHolding = useMemo(() => {
    const open = positions.filter((p) => p.status === 'open');
    return open[0]?.ticker;
  }, [positions]);

  const suggestions = baseSuggestions(positions.length > 0, topHolding);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    if (autoScroll) scrollToBottom();
  }, [messages, streamText, agents, autoScroll, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAutoScroll(atBottom);
  }

  const send = useCallback(
    async (message: string, depth: 'standard' | 'deep') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: LocalMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreamText('');
      setStreamCitations([]);
      setStatus('agents');
      setAutoScroll(true);
      const initialAgents = mockAgentsForMode(mode);
      setAgents(initialAgents);

      const sonarMode = mode === 'portfolio' ? 'analyze' : mode;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: sonarMode,
            controls: { depth: depth === 'deep' ? 'deep' : 'quick' },
            message,
            sessionId,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          setStatus('error');
          setAgents((prev) => prev.map((a) => ({ ...a, state: 'complete', completionNote: 'Failed' })));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accum = '';
        let firstToken = false;
        let gotCitations: Citation[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const part of parts) {
            if (!part.startsWith('data:')) continue;
            try {
              const evt = JSON.parse(part.slice(5).trim()) as {
                type: string;
                content?: string;
                citations?: Array<{ url: string; title?: string; snippet?: string }>;
              };
              if (evt.type === 'token' && evt.content) {
                if (!firstToken) {
                  firstToken = true;
                  setStatus('streaming');
                  setAgents((prev) => prev.map((a) => ({ ...a, state: 'complete', completionNote: `${a.name} complete` })));
                }
                accum += evt.content;
                setStreamText(accum);
              } else if (evt.type === 'citations' && evt.citations) {
                gotCitations = evt.citations;
                setStreamCitations(evt.citations);
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: accum,
            createdAt: new Date().toISOString(),
            citations: gotCitations,
          },
        ]);
        setStreamText('');
        setStreamCitations([]);
        setAgents([]);
        setStatus('done');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setStatus('error');
      }
    },
    [mode, sessionId]
  );

  const isEmpty = messages.length === 0 && status === 'idle';

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto custom-scrollbar"
      >
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
                  onSelect={(s) => void send(s, 'standard')}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[var(--chat-max-width)] px-4 py-6 space-y-6">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                createdAt={m.createdAt}
              />
            ))}

            {agents.length > 0 && (
              <div className="space-y-2">
                {agents.map((a) => (
                  <AgentStatusCard key={a.id} status={a} />
                ))}
              </div>
            )}

            {(status === 'streaming' || (status === 'agents' && streamText)) && streamText && (
              <StreamingAssistant content={streamText} />
            )}

            {streamCitations.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)] mb-2">
                  Sources
                </div>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 snap-x">
                  {streamCitations.map((c, i) => (
                    <div key={c.url + i} className="snap-start">
                      <CitationCard citation={c} index={i} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="text-sm text-cerna-loss">Something went wrong. Please try again.</div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 pt-2">
        <ChatInput onSend={send} disabled={status === 'agents' || status === 'streaming'} />
      </div>
    </div>
  );
}

function StreamingAssistant({ content }: { content: string }) {
  // Render with action-block styling live
  const segments: Array<{ type: 'text' | 'action'; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const r = new RegExp(ACTION_BLOCK_REGEX.source, 'g');
  while ((match = r.exec(content)) !== null) {
    if (match.index > lastIndex) segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    segments.push({ type: 'action', content: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) segments.push({ type: 'text', content: content.slice(lastIndex) });
  if (segments.length === 0) segments.push({ type: 'text', content });

  return (
    <div className="w-full text-cerna-text-primary">
      {segments.map((seg, i) =>
        seg.type === 'action' ? (
          <ActionBlock key={i} content={seg.content} />
        ) : (
          <div key={i} className="prose-cerna text-[15px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content}</ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}
