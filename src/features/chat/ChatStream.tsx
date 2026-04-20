'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation, ModeControls, SonarMode } from '@/types/chat';
import { CitationCard } from './CitationCard';
import { FollowUpChips } from './FollowUpChips';
import { ProgressTracker } from './ProgressTracker';

interface ChatStreamProps {
  mode: SonarMode;
  controls?: ModeControls;
  trigger: number;
  sessionId: string;
  message?: string;
  followUps?: string[];
  onFollowUp?: (msg: string) => void;
}

type Status = 'idle' | 'searching' | 'streaming' | 'done' | 'error';

export function ChatStream({
  mode,
  controls,
  trigger,
  sessionId,
  message,
  followUps = [],
  onFollowUp,
}: ChatStreamProps) {
  const [text, setText] = useState('');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (trigger === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setText('');
    setCitations([]);
    setError(null);
    setStatus('searching');

    async function run() {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, controls, message, sessionId }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = await res.text().catch(() => 'Request failed');
          setError(body);
          setStatus('error');
          return;
        }

        setStatus('streaming');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

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
                citations?: string[];
                error?: string;
              };
              if (evt.type === 'token' && evt.content) {
                setText((prev) => prev + evt.content);
              } else if (evt.type === 'citations' && evt.citations) {
                setCitations(evt.citations.map((url) => ({ url })));
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
  }, [trigger, mode, controls, message, sessionId]);

  return (
    <div className="mt-4">
      <ProgressTracker status={status} />

      {text && (
        <div className="prose-cerna">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      )}

      {status === 'error' && error && (
        <div className="mt-3 text-sm text-cerna-loss bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.3)] rounded-md p-3">
          {error}
        </div>
      )}

      {citations.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-2">Sources</div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {citations.map((c, i) => (
              <CitationCard key={c.url + i} citation={c} index={i} />
            ))}
          </div>
        </div>
      )}

      {status === 'done' && followUps.length > 0 && (
        <FollowUpChips suggestions={followUps} onSelect={(m) => onFollowUp?.(m)} />
      )}

      {status === 'done' && text && (
        <p className="mt-6 text-xs text-cerna-text-tertiary">
          Cerna Trading provides information only, not financial advice.
        </p>
      )}
    </div>
  );
}
