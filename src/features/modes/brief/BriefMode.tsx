'use client';

import { useState } from 'react';
import { Newspaper, Zap } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { BriefFocus, ChatMessage, ModeControls } from '@/types/chat';
import { useDeepRemaining } from '@/lib/gemini/use-deep-remaining';
import { cn } from '@/lib/utils/cn';

const FOCUS_OPTIONS: Array<{ id: BriefFocus; label: string; deep?: boolean }> = [
  { id: 'everything', label: 'Everything' },
  { id: 'earnings', label: 'Earnings Only' },
  { id: 'news', label: 'News Only' },
  { id: 'macro', label: 'Macro Only' },
  { id: 'analyst', label: 'Analyst Actions' },
  { id: 'dividends', label: 'Dividends' },
  { id: 'portfolio_health', label: 'Portfolio Health', deep: true },
];

export function BriefMode({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages?: ChatMessage[];
}) {
  const [scope, setScope] = useState<'holdings' | 'watchlist'>('holdings');
  const [depth, setDepth] = useState<'quick' | 'deep'>('quick');
  const [focus, setFocus] = useState<BriefFocus>('everything');
  const [trigger, setTrigger] = useState(0);
  const [controls, setControls] = useState<ModeControls>({});
  const { remaining: deepRemaining } = useDeepRemaining();

  function run() {
    setControls({ scope, depth, focus });
    setTrigger((t) => t + 1);
  }

  const selectedOption = FOCUS_OPTIONS.find((o) => o.id === focus);
  const isDeep = !!selectedOption?.deep;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Focus
          </label>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value as BriefFocus)}
            className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
          >
            {FOCUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.deep ? ' ⚡' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Scope
          </label>
          <div className="flex rounded-full glass p-0.5">
            {(
              [
                ['holdings', 'All holdings'],
                ['watchlist', 'Watchlist only'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setScope(val)}
                className={cn(
                  'px-4 py-2 text-sm rounded-full transition-smooth min-h-[40px]',
                  scope === val
                    ? 'bg-cerna-primary text-white'
                    : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Depth
          </label>
          <div className="flex rounded-full glass p-0.5">
            {(['quick', 'deep'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDepth(d)}
                className={cn(
                  'px-4 py-2 text-sm rounded-full capitalize transition-smooth min-h-[40px]',
                  depth === d
                    ? 'bg-cerna-primary text-white'
                    : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                )}
              >
                {d === 'deep' ? 'Full' : 'Quick'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={run}
          className="w-full sm:w-auto px-8 py-3 text-base rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[48px] sm:ml-auto flex items-center justify-center gap-2"
        >
          <Newspaper size={16} />
          Brief me
        </button>
      </div>

      {isDeep && deepRemaining !== null && (
        <div className="mt-2 text-xs flex items-center gap-1.5">
          {deepRemaining > 0 ? (
            <>
              <Zap size={12} className="text-amber-400/70" />
              <span className="text-amber-400/70">
                Uses deep analysis ({deepRemaining} remaining today)
              </span>
            </>
          ) : (
            <span className="text-cerna-text-tertiary">
              Deep analysis limit reached — using standard model
            </span>
          )}
        </div>
      )}

      {trigger === 0 && initialMessages.length === 0 ? (
        <EmptyState
          Icon={Newspaper}
          title="Your morning brief"
          description="Get a synthesized intelligence update across all your holdings."
        />
      ) : (
        <ChatStream
          mode="brief"
          controls={controls}
          trigger={trigger}
          sessionId={sessionId}
          initialMessages={initialMessages}
          followUps={[
            'Which stock has the biggest news today?',
            'Any action items I should act on now?',
            'Expand on holdings update',
          ]}
        />
      )}
    </div>
  );
}
