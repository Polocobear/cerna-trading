'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, Citation } from '@/types/chat';
import { CitationCard } from './CitationCard';

interface HistoricalMessagesProps {
  messages: ChatMessage[];
  hasNew?: boolean;
}

function renderWithCitations(children: React.ReactNode): React.ReactNode {
  const nodes = React.Children.toArray(children);
  return nodes.map((node, i) => {
    if (typeof node !== 'string') return <span key={i}>{node}</span>;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const r = /\[(\d+)\]/g;
    let match: RegExpExecArray | null;
    while ((match = r.exec(node)) !== null) {
      if (match.index > lastIndex) parts.push(node.slice(lastIndex, match.index));
      parts.push(
        <sup
          key={`${i}-${match.index}`}
          className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-[rgba(124,91,240,0.15)] text-cerna-primary font-medium mx-0.5"
        >
          {match[1]}
        </sup>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < node.length) parts.push(node.slice(lastIndex));
    return <span key={i}>{parts}</span>;
  });
}

export function HistoricalMessages({ messages, hasNew }: HistoricalMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-5 mb-6">
      {messages.map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] px-4 py-3 rounded-xl glass border-l-2 border-[rgba(124,91,240,0.4)] text-sm text-cerna-text-primary whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          );
        }
        const citations: Citation[] = Array.isArray(m.citations) ? m.citations : [];
        return (
          <div key={m.id} className="animate-fade-in">
            <div className="prose-cerna">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p>{renderWithCitations(children)}</p>,
                  li: ({ children }) => <li>{renderWithCitations(children)}</li>,
                }}
              >
                {m.content}
              </ReactMarkdown>
            </div>
            {citations.length > 0 && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wider text-cerna-text-tertiary mb-2">Sources</div>
                <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2">
                  {citations.map((c, i) => (
                    <CitationCard key={c.url + i} citation={c} index={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {hasNew && (
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px border-t border-dashed border-cerna-border" />
          <span className="text-xs text-cerna-text-tertiary">Continuing conversation…</span>
          <div className="flex-1 h-px border-t border-dashed border-cerna-border" />
        </div>
      )}
    </div>
  );
}
