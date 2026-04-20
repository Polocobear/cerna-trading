'use client';

import { useState } from 'react';
import { ChatStream } from '@/features/chat/ChatStream';
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
      <div className="flex flex-wrap items-end gap-3 p-4 bg-cerna-bg-secondary rounded-xl border border-cerna-border">
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Scope
          </label>
          <div className="flex rounded-md border border-cerna-border overflow-hidden">
            <button
              onClick={() => setScope('holdings')}
              className={`px-3 py-2 text-sm ${scope === 'holdings' ? 'bg-cerna-primary text-white' : 'bg-cerna-bg-tertiary text-cerna-text-secondary'}`}
            >
              All holdings
            </button>
            <button
              onClick={() => setScope('watchlist')}
              className={`px-3 py-2 text-sm ${scope === 'watchlist' ? 'bg-cerna-primary text-white' : 'bg-cerna-bg-tertiary text-cerna-text-secondary'}`}
            >
              Watchlist only
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Depth
          </label>
          <div className="flex rounded-md border border-cerna-border overflow-hidden">
            <button
              onClick={() => setDepth('quick')}
              className={`px-3 py-2 text-sm ${depth === 'quick' ? 'bg-cerna-primary text-white' : 'bg-cerna-bg-tertiary text-cerna-text-secondary'}`}
            >
              Quick
            </button>
            <button
              onClick={() => setDepth('deep')}
              className={`px-3 py-2 text-sm ${depth === 'deep' ? 'bg-cerna-primary text-white' : 'bg-cerna-bg-tertiary text-cerna-text-secondary'}`}
            >
              Full
            </button>
          </div>
        </div>
        <button
          onClick={run}
          className="px-5 py-2 rounded-md bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition"
        >
          Brief me
        </button>
      </div>

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
    </div>
  );
}
