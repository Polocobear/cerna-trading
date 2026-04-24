'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ActionBlock } from './ActionBlock';
import {
  createChatMarkdownComponents,
  preprocessChatMarkdown,
} from './markdown';
import { cn } from '@/lib/utils/cn';

interface MessageBubbleProps {
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

const ACTION_BLOCK_REGEX = /<action-block>([\s\S]*?)<\/action-block>/g;

interface Segment {
  type: 'text' | 'action';
  content: string;
}

function splitSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const r = new RegExp(ACTION_BLOCK_REGEX.source, 'g');
  while ((match = r.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'action', content: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }
  return segments.length === 0 ? [{ type: 'text', content }] : segments;
}

export function MessageBubble({ messageId, role, content, createdAt }: MessageBubbleProps) {
  const timestamp = createdAt ? new Date(createdAt).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  }) : null;

  if (role === 'user') {
    return (
      <div
        className={cn('flex justify-end group/msg', 'animate-message-in')}
      >
        <div
          className="max-w-[85%] rounded-2xl px-4 py-2.5 text-cerna-text-primary"
          style={{
            background: 'rgba(124,91,240,0.15)',
            border: '1px solid rgba(124,91,240,0.2)',
          }}
          title={timestamp ?? undefined}
        >
          <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
            {content}
          </div>
        </div>
      </div>
    );
  }

  const segments = splitSegments(content);

  return (
    <div className="flex group/msg animate-message-in">
      <div className="chat-message w-full text-cerna-text-primary" title={timestamp ?? undefined}>
        {segments.map((seg, i) => {
          if (seg.type === 'action') {
            return <ActionBlock key={i} content={seg.content} />;
          }

          const contentWithCitations = preprocessChatMarkdown(seg.content, messageId);

          return (
            <div key={i} className="prose-cerna text-[15px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={createChatMarkdownComponents()}>
                {contentWithCitations}
              </ReactMarkdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}
