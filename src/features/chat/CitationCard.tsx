import type { Citation } from '@/types/chat';

interface CitationCardProps {
  citation: Citation;
  index: number;
}

export function CitationCard({ citation, index }: CitationCardProps) {
  let domain = citation.domain;
  try {
    if (!domain) domain = new URL(citation.url).hostname.replace(/^www\./, '');
  } catch {
    domain = citation.url;
  }

  return (
    <a
      href={citation.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex-shrink-0 w-56 p-3 rounded-lg bg-cerna-bg-tertiary border border-cerna-border hover:border-cerna-border-hover transition"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-mono text-cerna-primary">[{index + 1}]</span>
        <span className="text-xs text-cerna-text-tertiary truncate">{domain}</span>
      </div>
      <div className="text-sm text-cerna-text-primary line-clamp-2">
        {citation.title ?? citation.url}
      </div>
    </a>
  );
}
