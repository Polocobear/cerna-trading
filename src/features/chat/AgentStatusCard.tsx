'use client';

import { Check, Clock, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface AgentStatus {
  id: string;
  name: string;
  description: string;
  Icon: LucideIcon;
  state: 'pending' | 'running' | 'complete' | 'error';
  completionNote?: string;
  sources?: { title: string; url: string; domain: string }[];
}

interface AgentStatusCardProps {
  status: AgentStatus;
}

function splitCompletionNote(note?: string): { detail?: string; elapsed?: string } {
  if (!note) return {};
  const match = note.match(/\(([^()]*elapsed)\)\s*$/i);
  if (!match || match.index == null) {
    return { detail: note };
  }
  return {
    detail: note.slice(0, match.index).trim(),
    elapsed: match[1].trim(),
  };
}

export function AgentStatusCard({ status }: AgentStatusCardProps) {
  const { name, description, state, completionNote, sources } = status;
  const { detail, elapsed } = splitCompletionNote(completionNote ?? description);

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'rounded-lg p-3 border animate-agent-slide-in',
          (state === 'complete' || state === 'pending') && 'opacity-80',
          state === 'error' && 'border-amber-500/30 bg-amber-500/10'
        )}
        style={{
          background: state === 'error' ? undefined : 'rgba(255,255,255,0.03)',
          borderColor: state === 'error' ? undefined : 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
              state === 'error' ? 'bg-amber-500/20' : 'bg-[#7c5bf0]/15'
            )}
          >
            {state === 'complete' ? (
              <Check size={14} className="text-emerald-400" />
            ) : state === 'pending' ? (
              <Clock size={14} className="text-gray-400" />
            ) : state === 'error' ? (
              <AlertTriangle size={14} className="text-amber-400" />
            ) : (
              <div className="h-4 w-4 rounded-full border-2 border-[#7c5bf0]/35 border-t-[#7c5bf0] animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-cerna-text-primary">
              {name}
              {state === 'pending' && <span className="ml-2 text-gray-500 font-normal">Queued</span>}
              {state === 'running' && <span className="ml-2 text-[#7c5bf0] font-normal">Running</span>}
              </div>
              {elapsed && state === 'running' && (
                <span className="shrink-0 rounded-full border border-white/10 bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[rgba(255,255,255,0.5)]">
                  {elapsed}
                </span>
              )}
            </div>
            <div className={cn('text-[12px] leading-5', state === 'error' ? 'text-amber-200/80' : 'text-[rgba(255,255,255,0.4)]')}>
              {detail ?? description}
            </div>
          </div>
        </div>
        {state === 'running' && (
          <div
            className="mt-2 h-[3px] rounded-full overflow-hidden"
            style={{ background: 'rgba(124,91,240,0.08)' }}
          >
            <div
              className="h-full w-full"
              style={{
                background: 'var(--agent-shimmer)',
                backgroundSize: '200% 100%',
                animation: 'agent-shimmer 1.4s ease-in-out infinite',
              }}
            />
          </div>
        )}
      </div>
      
      {state === 'complete' && sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-2">
          {sources.map((source, i) => (
            <a
              key={i}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors truncate max-w-[150px]"
            >
              {source.domain || new URL(source.url).hostname.replace(/^www\./, '')}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
