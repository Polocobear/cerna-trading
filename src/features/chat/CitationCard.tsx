import type { Citation } from '@/types/chat';

interface CitationCardProps {
  citation: Citation;
  index: number;
  anchorId?: string;
}

export function CitationCard({ citation, index, anchorId }: CitationCardProps) {
  let domain = citation.domain;
  try {
    if (!domain) domain = new URL(citation.url).hostname.replace(/^www\./, '');
  } catch {
    domain = citation.url;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <a
      id={anchorId}
      href={citation.url}
      target="_blank"
      rel="noreferrer noopener"
      className="source-card-target block w-64 flex-shrink-0 snap-start rounded-xl border p-3 transition-colors hover:border-cerna-primary/50"
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 text-[11px] rounded-full bg-[#7c5bf0]/15 text-[#7c5bf0] font-medium shrink-0">
          {index + 1}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={faviconUrl} alt="" className="w-4 h-4 rounded-sm shrink-0 bg-white/10" />
        <span className="text-xs text-cerna-text-tertiary truncate">{domain}</span>
      </div>
      <div className="text-sm font-medium text-cerna-text-primary line-clamp-2 mb-1">
        {citation.title ?? citation.url}
      </div>
      {citation.snippet && (
        <div className="text-[13px] text-[rgba(255,255,255,0.5)] line-clamp-2">
          {citation.snippet}
        </div>
      )}
    </a>
  );
}
