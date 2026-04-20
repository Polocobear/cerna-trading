'use client';

import { Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface AgentStatus {
  id: string;
  name: string;
  description: string;
  Icon: LucideIcon;
  state: 'running' | 'complete';
  completionNote?: string;
}

interface AgentStatusCardProps {
  status: AgentStatus;
}

export function AgentStatusCard({ status }: AgentStatusCardProps) {
  const { name, description, Icon, state, completionNote } = status;
  return (
    <div
      className={cn(
        'rounded-lg p-3 border animate-agent-slide-in',
        state === 'complete' && 'opacity-80'
      )}
      style={{
        background: 'rgba(255,255,255,0.03)',
        borderColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'rgba(124,91,240,0.15)' }}
        >
          {state === 'complete' ? (
            <Check size={14} className="text-emerald-400" />
          ) : (
            <Icon size={14} style={{ color: 'var(--color-primary)' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-cerna-text-primary">{name}</div>
          <div className="text-[12px] text-[rgba(255,255,255,0.4)] truncate">
            {state === 'complete' && completionNote ? completionNote : description}
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
  );
}
