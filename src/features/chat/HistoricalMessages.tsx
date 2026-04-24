'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '@/types/chat';
import { preprocessChatMarkdown, createChatMarkdownComponents } from './markdown';
import { SourceRail } from './SourceRail';

interface HistoricalMessagesProps {
  messages: ChatMessage[];
  hasNew?: boolean;
}

export function HistoricalMessages({ messages, hasNew }: HistoricalMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="mb-6 space-y-5">
      {messages.map((message) => {
        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="glass max-w-[80%] whitespace-pre-wrap rounded-xl border-l-2 border-[rgba(124,91,240,0.4)] px-4 py-3 text-sm text-cerna-text-primary">
                {message.content}
              </div>
            </div>
          );
        }

        const sources = Array.isArray(message.citations)
          ? message.citations.map((citation) => ({
              url: citation.url,
              title: citation.title,
              domain: citation.domain,
              snippet: citation.snippet,
            }))
          : [];

        return (
          <div key={message.id} className="animate-fade-in">
            <div className="chat-message prose-cerna">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={createChatMarkdownComponents()}
              >
                {preprocessChatMarkdown(message.content, message.id)}
              </ReactMarkdown>
            </div>
            {sources.length > 0 && <div className="mt-4"><SourceRail messageId={message.id} sources={sources} /></div>}
          </div>
        );
      })}

      {hasNew && (
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 border-t border-dashed border-cerna-border" />
          <span className="text-xs text-cerna-text-tertiary">Continuing conversation...</span>
          <div className="flex-1 border-t border-dashed border-cerna-border" />
        </div>
      )}
    </div>
  );
}
