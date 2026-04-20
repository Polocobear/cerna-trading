'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Wallet } from 'lucide-react';
import { ModeBar } from './ModeBar';
import { ContextPanel } from '@/features/context-panel/ContextPanel';
import { ScreenMode } from '@/features/modes/screen/ScreenMode';
import { AnalyzeMode } from '@/features/modes/analyze/AnalyzeMode';
import { BriefMode } from '@/features/modes/brief/BriefMode';
import { AskMode } from '@/features/modes/ask/AskMode';
import { PortfolioMode } from '@/features/modes/portfolio/PortfolioMode';
import { createClient } from '@/lib/supabase/client';
import type { Position, WatchlistItem, JournalEntry, Profile } from '@/types/portfolio';
import type { Mode } from '@/types/chat';

interface AppShellProps {
  initialProfile: Profile | null;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
  initialJournal: JournalEntry[];
  userEmail: string;
}

export function AppShell(props: AppShellProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('screen');
  const [analyzeTicker, setAnalyzeTicker] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [positions, setPositions] = useState<Position[]>(props.initialPositions);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(props.initialWatchlist);
  const [journal] = useState<JournalEntry[]>(props.initialJournal);

  const sessionId = useMemo(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const selectTicker = useCallback((ticker: string) => {
    setAnalyzeTicker(ticker);
    setMode('analyze');
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  async function addPosition(data: {
    ticker: string;
    shares: number;
    cost_basis: number;
    date_acquired?: string;
    thesis?: string;
    company_name?: string;
  }) {
    const res = await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { position } = (await res.json()) as { position: Position };
      setPositions((prev) => [position, ...prev]);
    }
  }

  async function closePosition(p: Position) {
    const priceStr = prompt('Close price per share?');
    if (!priceStr) return;
    const close_price = Number(priceStr);
    if (!Number.isFinite(close_price)) return;
    const res = await fetch('/api/portfolio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, status: 'closed', close_price }),
    });
    if (res.ok) {
      const { position } = (await res.json()) as { position: Position };
      setPositions((prev) => prev.map((x) => (x.id === position.id ? position : x)));
    }
  }

  async function deletePosition(id: string) {
    const res = await fetch('/api/portfolio', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  async function addWatch(data: { ticker: string; target_price?: number; notes?: string }) {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { item } = (await res.json()) as { item: WatchlistItem };
      setWatchlist((prev) => [item, ...prev]);
    }
  }

  async function removeWatch(id: string) {
    const res = await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (res.ok) setWatchlist((prev) => prev.filter((w) => w.id !== id));
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-5 py-3 border-b border-cerna-border bg-cerna-bg-secondary">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cerna-primary flex items-center justify-center text-white font-bold">
            C
          </div>
          <span className="font-semibold tracking-tight">Cerna Trading</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-cerna-text-tertiary hidden md:inline">{props.userEmail}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-cerna-text-secondary hover:text-cerna-text-primary transition"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </header>

      <ModeBar active={mode} onChange={setMode} />

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-24 lg:pb-6">
          {mode === 'screen' && <ScreenMode sessionId={sessionId} />}
          {mode === 'analyze' && (
            <AnalyzeMode
              sessionId={sessionId}
              initialTicker={analyzeTicker}
              positions={positions}
              watchlist={watchlist}
            />
          )}
          {mode === 'brief' && <BriefMode sessionId={sessionId} />}
          {mode === 'portfolio' && (
            <PortfolioMode
              positions={positions}
              watchlist={watchlist}
              journal={journal}
              onAnalyze={selectTicker}
              onAddPosition={addPosition}
              onClosePosition={closePosition}
              onDeletePosition={deletePosition}
              onAddWatch={addWatch}
              onRemoveWatch={removeWatch}
            />
          )}
          {mode === 'ask' && <AskMode sessionId={sessionId} />}
        </main>

        <ContextPanel
          positions={positions}
          watchlist={watchlist}
          journal={journal}
          cashAvailable={props.initialProfile?.cash_available ?? 0}
          onSelectTicker={(t) => {
            selectTicker(t);
            setDrawerOpen(false);
          }}
          activeTicker={analyzeTicker}
          mobileOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </div>

      {/* Mobile FAB */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="lg:hidden fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full bg-cerna-primary hover:bg-cerna-primary-hover text-white flex items-center justify-center glow-primary transition-smooth"
        aria-label="Open portfolio panel"
      >
        <Wallet size={20} />
      </button>
    </div>
  );
}
