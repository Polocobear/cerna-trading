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
      className="block flex-shrink-0 w-56 p-3 rounded-lg glass hover:border-cerna-border-hover transition-smooth"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-[rgba(124,91,240,0.15)] text-cerna-primary font-medium">
          {index + 1}
        </span>
        <span className="text-xs text-cerna-text-tertiary truncate">{domain}</span>
      </div>
      <div className="text-sm text-cerna-text-primary line-clamp-2">
        {citation.title ?? citation.url}
      </div>
    </a>
  );
}
