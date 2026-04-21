'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ActionBlockProps {
  content: string;
}

const SMSF_REGEX = /<smsf-note>([\s\S]*?)<\/smsf-note>/g;

interface Segment {
  type: 'body' | 'smsf';
  content: string;
}

function splitSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const r = new RegExp(SMSF_REGEX.source, 'g');
  while ((match = r.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'body', content: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'smsf', content: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: 'body', content: content.slice(lastIndex) });
  }
  return segments.length === 0 ? [{ type: 'body', content }] : segments;
}

export function ActionBlock({ content }: ActionBlockProps) {
  const segments = splitSegments(content);
  return (
    <div
      className="my-4 rounded-lg p-5 animate-action-block-in"
      style={{
        background: 'var(--action-block-bg)',
        borderLeft: '3px solid var(--action-block-border)',
      }}
    >
      <div
        className="text-[14px] font-semibold mb-2"
        style={{ color: 'var(--color-primary)' }}
      >
        What this means for your portfolio
      </div>
      {segments.map((seg, i) =>
        seg.type === 'smsf' ? (
          <div
            key={i}
            className="mt-3 rounded-md p-3 text-[13px]"
            style={{
              background: 'var(--smsf-note-bg)',
              borderLeft: '3px solid var(--smsf-note-border)',
            }}
          >
            <div className="text-[11px] uppercase tracking-wider mb-1 text-amber-400 font-medium">
              SMSF note
            </div>
            <div className="prose-cerna text-[13px] text-cerna-text-secondary">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content.trim()}</ReactMarkdown>
            </div>
          </div>
        ) : (
          <div key={i} className="prose-cerna text-[14px] action-block-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{seg.content.trim()}</ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}
