'use client';

import { useState } from 'react';
import type { Citation } from '@/types/chat';
import { CitationCard } from './CitationCard';
import { sourceAnchorId } from './markdown';

interface SourceRailProps {
  messageId: string;
  sources: Citation[];
}

const MAX_VISIBLE_SOURCES = 3;

export function SourceRail({ messageId, sources }: SourceRailProps) {
  const [showAll, setShowAll] = useState(false);

  if (sources.length === 0) return null;

  const visibleSources = showAll ? sources : sources.slice(0, MAX_VISIBLE_SOURCES);

  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-[0.18em] text-[rgba(255,255,255,0.34)]">
        Sources
      </div>
      <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-2 pr-1 snap-x">
        {visibleSources.map((source, index) => {
          const sourceIndex = index + 1;
          return (
            <CitationCard
              key={`${source.url}-${sourceIndex}`}
              citation={source}
              index={index}
              anchorId={sourceAnchorId(messageId, sourceIndex)}
            />
          );
        })}
        {!showAll && sources.length > MAX_VISIBLE_SOURCES && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex h-auto w-32 shrink-0 snap-start items-center justify-center rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm font-medium text-[#7c5bf0] transition-colors hover:bg-[rgba(255,255,255,0.08)] hover:text-[#9d85f5]"
          >
            +{sources.length - MAX_VISIBLE_SOURCES} more
          </button>
        )}
      </div>
    </div>
  );
}
