'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { ChatStream } from '@/features/chat/ChatStream';
import { EmptyState } from '@/features/chat/EmptyState';
import type { ChatMessage, ModeControls } from '@/types/chat';

const SECTORS = ['All', 'Mining', 'Banking', 'Tech', 'Healthcare', 'Energy', 'Consumer', 'REIT'];
const CAPS = ['All', 'Large ($5B+)', 'Mid ($500M-5B)', 'Small ($100-500M)'];

export function ScreenMode({
  sessionId,
  initialMessages = [],
}: {
  sessionId: string;
  initialMessages?: ChatMessage[];
}) {
  const [sector, setSector] = useState('All');
  const [marketCap, setMarketCap] = useState('All');
  const [depth, setDepth] = useState<'quick' | 'deep'>('quick');
  const [trigger, setTrigger] = useState(0);
  const [controls, setControls] = useState<ModeControls>({});

  function run() {
    setControls({ sector, marketCap, depth });
    setTrigger((t) => t + 1);
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="glass rounded-xl p-4 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Sector
          </label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
          >
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs uppercase tracking-wider text-cerna-text-tertiary mb-1.5">
            Market cap
          </label>
          <select
            value={marketCap}
            onChange={(e) => setMarketCap(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-cerna-bg-primary border border-cerna-border text-cerna-text-primary focus:border-cerna-border-active focus:outline-none focus:ring-1 focus:ring-[rgba(124,91,240,0.25)] transition-smooth min-h-[44px]"
          >
            {CAPS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
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
                {d}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={run}
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-cerna-primary hover:bg-cerna-primary-hover text-white font-medium transition-smooth glow-primary-hover min-h-[44px] flex items-center justify-center gap-2"
        >
          <Search size={16} />
          Screen ASX
        </button>
      </div>

      {trigger === 0 && initialMessages.length === 0 ? (
        <EmptyState
          Icon={Search}
          title="Screen the ASX for opportunities"
          description="Select your filters and click Screen ASX to find undervalued stocks."
        />
      ) : (
        <ChatStream
          mode="screen"
          controls={controls}
          trigger={trigger}
          sessionId={sessionId}
          initialMessages={initialMessages}
          followUps={[
            'Show cheapest one in detail',
            'Compare to my current holdings',
            'Focus on dividend payers',
          ]}
        />
      )}
    </div>
  );
}
