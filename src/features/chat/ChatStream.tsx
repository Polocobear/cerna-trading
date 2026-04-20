'use client';

import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ChatMessage, Citation, ModeControls, SonarMode } from '@/types/chat';
import { CitationCard } from './CitationCard';
import { FollowUpChips } from './FollowUpChips';
import { ProgressTracker } from './ProgressTracker';
import { Skeleton } from './Skeleton';
import { HistoricalMessages } from './HistoricalMessages';
import { Clock } from 'lucide-react';

interface ChatStreamProps {
  mode: SonarMode;
  controls?: ModeControls;
  trigger: number;
  sessionId: string;
  message?: string;
  followUps?: string[];
  onFollowUp?: (msg: string) => void;
  initialMessages?: ChatMessage[];
}

type Status = 'idle' | 'searching' | 'streaming' | 'done' | 'error';

function renderWithCitations(children: React.ReactNode, regex: RegExp): React.ReactNode {
  const nodes = React.Children.toArray(children);
  return nodes.map((node, i) => {
    if (typeof node !== 'string') return <span key={i}>{node}</span>;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const r = new RegExp(regex.source, 'g');
    while ((match = r.exec(node)) !== null) {
      if (match.index > lastIndex) parts.push(node.slice(lastIndex, match.index));
      const n = match[1];
      parts.push(
        <sup
          key={`${i}-${match.index}`}
          className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-[rgba(124,91,240,0.15)] text-cerna-primary font-medium mx-0.5 cursor-pointer hover:bg-cerna-primary hover:text-white transition-smooth"
        >
          {n}
        </sup>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < node.length) parts.push(node.slice(lastIndex));
    return <span key={i}>{parts}</span>;
  });
}

export function ChatStream({
  mode,
  controls,
  trigger,
  sessionId,
  message,
  followUps = [],
  onFollowUp,
  initialMessages = [],
}: ChatStreamProps) {
  const [text, setText] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (trigger === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText('');
    setCitations([]);
    setError(null);
    setRateLimited(false);
    setStatus('searching');

    async function run() {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, controls, message, sessionId }),
          signal: controller.signal,
        });

        if (res.status === 429) {
          setRateLimited(true);
          setStatus('error');
          return;
        }
        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => 'Request failed');
          setError(body);
          setStatus('error');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstToken = false;

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
                error?: string;
              };
              if (evt.type === 'token' && evt.content) {
                if (!firstToken) {
                  firstToken = true;
                  setStatus('streaming');
                }
                setText((prev) => prev + evt.content);
              } else if (evt.type === 'citations' && evt.citations) {
                setCitations(evt.citations);
              } else if (evt.type === 'error') {
                setError(evt.error ?? 'Stream error');
                setStatus('error');
              }
            } catch {
              // ignore
            }
          }
        }
        setStatus('done');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
        setStatus('error');
      }
    }

    void run();

    return () => controller.abort();
  }, [trigger, mode, controls, message, sessionId, retryKey]);

  // Split text on [N] citation markers to render badges inline
  const citationRegex = /\[(\d+)\]/g;

  const hasNew = trigger > 0 && (!!text || status !== 'idle');

  return (
    <div className="mt-4 animate-fade-in">
      {initialMessages.length > 0 && (
        <HistoricalMessages messages={initialMessages} hasNew={hasNew} />
      )}

      {status === 'searching' && !text && (
        <>
          <div className="flex items-center gap-2 text-sm text-cerna-text-secondary py-3">
            <span className="inline-flex gap-1">
              <span className="pulse-dot" />
              <span className="pulse-dot" />
              <span className="pulse-dot" />
            </span>
            <span>Searching sources…</span>
          </div>
          <div className="space-y-2 mt-2">
            <Skeleton variant="text" width="85%" />
            <Skeleton variant="text" width="72%" />
            <Skeleton variant="text" width="60%" />
          </div>
        </>
      )}

      <ProgressTracker status={status} />

      {text && (
        <div className="prose-cerna">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p>{renderWithCitations(children, citationRegex)}</p>,
              li: ({ children }) => <li>{renderWithCitations(children, citationRegex)}</li>,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      )}

      {status === 'error' && rateLimited && (
        <div className="mt-3 glass rounded-lg p-5 flex flex-col items-center text-center">
          <Clock size={32} className="text-amber-500 mb-2" />
          <div className="text-sm font-semibold text-cerna-text-primary">Slow down</div>
          <div className="text-sm text-cerna-text-secondary mt-1 max-w-sm">
            You&apos;re going too fast. Please wait a moment before your next query.
          </div>
        </div>
      )}

      {status === 'error' && !rateLimited && error && (
        <div className="mt-3 glass rounded-lg p-5 flex flex-col items-center text-center">
          <AlertTriangle size={32} className="text-amber-500 mb-2" />
          <div className="text-sm font-semibold text-cerna-text-primary">Analysis unavailable</div>
          <div className="text-sm text-cerna-text-secondary mt-1 max-w-sm">
            We couldn&apos;t reach our data sources. Please try again.
          </div>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-cerna-primary text-cerna-primary hover:bg-cerna-primary hover:text-white transition-smooth text-sm"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {citations.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-2">Sources</div>
          <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 snap-x stagger-children">
            {citations.map((c, i) => (
              <div key={c.url + i} className="snap-start">
                <CitationCard citation={c} index={i} />
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'done' && followUps.length > 0 && (
        <FollowUpChips suggestions={followUps} onSelect={(m) => onFollowUp?.(m)} />
      )}

      {status === 'done' && text && (
        <p className="mt-4 pt-4 border-t border-cerna-border text-xs text-cerna-text-tertiary">
          Cerna Trading provides information only, not financial advice.
        </p>
      )}
    </div>
  );
}
