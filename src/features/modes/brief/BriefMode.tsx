'use client';

import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { ModeControls } from '@/types/chat';

export function BriefMode({ sessionId }: { sessionId: string }) {
  const [scope, setScope] = useState<'holdings' | 'watchlist'>('holdings');
  const [depth, setDepth] = useState<'quick' | 'deep'>('quick');
  const [trigger, setTrigger] = useState(0);
  const [controls, setControls] = useState<ModeControls>({});

  function run() {
    setControls({ scope, depth });
    setTrigger((t) => t + 1);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Scope
          </label>
          <div className="flex rounded-full glass p-0.5">
            {([
              ['holdings', 'All holdings'],
              ['watchlist', 'Watchlist only'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setScope(val)}
                className={`px-4 py-2 text-sm rounded-full transition-smooth min-h-[40px] ${
                  scope === val
                    ? 'bg-cerna-primary text-white'
                    : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                }`}
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
                className={`px-4 py-2 text-sm rounded-full capitalize transition-smooth min-h-[40px] ${
                  depth === d
                    ? 'bg-cerna-primary text-white'
                    : 'text-cerna-text-secondary hover:text-cerna-text-primary'
                }`}
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

      {trigger === 0 ? (
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
