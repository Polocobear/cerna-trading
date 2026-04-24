'use client';

import type { MouseEvent } from 'react';
import type { Components } from 'react-markdown';

function normalizeLabel(value: string): string {
  return value
    .replace(/[*_`~[\]()]/g, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .toLowerCase();
}

export function sourceAnchorId(messageId: string, index: number): string {
  return `source-${messageId}-${index}`;
}

export function deduplicateHeaders(markdown: string): string {
  const lines = markdown.split('\n');
  const deduped: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const blockquoteMatch = line.match(/^>\s*(.+?)\s*$/);

    if (!blockquoteMatch) {
      deduped.push(line);
      continue;
    }

    let nextIndex = i + 1;
    while (nextIndex < lines.length && lines[nextIndex]?.trim() === '') {
      nextIndex += 1;
    }

    const headingMatch = lines[nextIndex]?.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (
      headingMatch &&
      normalizeLabel(blockquoteMatch[1]) === normalizeLabel(headingMatch[2])
    ) {
      i = nextIndex - 1;
      continue;
    }

    deduped.push(line);
  }

  return deduped.join('\n');
}

export function linkifyCitations(markdown: string, messageId: string): string {
  return markdown.replace(
    /\[(\d+)\]/g,
    (_match, rawIndex: string) => `[[${
      rawIndex
    }]](#${sourceAnchorId(messageId, Number(rawIndex))})`
  );
}

export function preprocessChatMarkdown(markdown: string, messageId: string): string {
  return linkifyCitations(deduplicateHeaders(markdown), messageId);
}

function handleCitationClick(event: MouseEvent<HTMLAnchorElement>, href: string): void {
  const targetId = href.replace(/^#/, '');
  const target = document.getElementById(targetId);
  if (!target) return;

  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  target.classList.add('source-card-flash');
  window.setTimeout(() => target.classList.remove('source-card-flash'), 1400);
}

export function createChatMarkdownComponents(): Components {
  return {
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('#source-')) {
        return (
          <sup className="inline-flex">
            <a
              href={href}
              className="citation-ref"
              onClick={(event) => handleCitationClick(event, href)}
              title={`View source ${String(children)}`}
              {...props}
            >
              {children}
            </a>
          </sup>
        );
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#7c5bf0] hover:underline"
          {...props}
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="rounded-xl border border-[rgba(124,91,240,0.22)] border-l-[3px] border-l-[#7c5bf0] bg-[rgba(124,91,240,0.08)] px-4 py-3 text-[rgba(255,255,255,0.84)]">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-[rgba(255,255,255,0.02)]">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th>{children}</th>,
    td: ({ children }) => <td>{children}</td>,
  };
}
