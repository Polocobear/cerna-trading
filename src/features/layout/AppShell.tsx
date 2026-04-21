'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { MobileDrawer } from './MobileDrawer';
import { AgentChat } from '@/features/chat/AgentChat';
import { ScreenMode } from '@/features/modes/screen/ScreenMode';
import { AnalyzeMode } from '@/features/modes/analyze/AnalyzeMode';
import { BriefMode } from '@/features/modes/brief/BriefMode';
import { PortfolioMode } from '@/features/modes/portfolio/PortfolioMode';
import { useSessionMessages } from '@/lib/sessions/use-session-messages';
import { createClient } from '@/lib/supabase/client';
import type { SessionSummary } from '@/features/layout/SidebarHistory';
import type { Position, WatchlistItem, JournalEntry, Profile } from '@/types/portfolio';
export type ViewId = 'chat' | 'screen' | 'analyze' | 'brief' | 'portfolio';

interface AppShellProps {
  initialProfile: Profile | null;
  initialPositions: Position[];
  initialWatchlist: WatchlistItem[];
  initialJournal: JournalEntry[];
  userEmail: string;
  initialView?: ViewId;
}

export function AppShell(props: AppShellProps) {
  const router = useRouter();
  const [view, setView] = useState<ViewId>(props.initialView ?? 'chat');
  const [analyzeTicker, setAnalyzeTicker] = useState('');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [positions, setPositions] = useState<Position[]>(props.initialPositions);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(props.initialWatchlist);
  const [journal] = useState<JournalEntry[]>(props.initialJournal);

  const [sessionKey, setSessionKey] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);

  const sessionId = useMemo(() => {
    if (activeSessionId) return activeSessionId;
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, activeSessionId]);

  const { messages: historyMessages } = useSessionMessages(activeSessionId ?? null);

  const handleSelectSession = useCallback((s: SessionSummary) => {
    const v: ViewId = s.mode === 'ask' ? 'chat' : (s.mode as ViewId);
    setView(v);
    setActiveSessionId(s.id);
    setSessionKey((k) => k + 1);
    setMobileDrawerOpen(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setView('chat');
    setActiveSessionId(undefined);
    setSessionKey((k) => k + 1);
    setMobileDrawerOpen(false);
  }, []);

  const handleSelectView = useCallback((v: ViewId) => {
    setView(v);
    setMobileDrawerOpen(false);
  }, []);

  const selectTicker = useCallback((ticker: string) => {
    setAnalyzeTicker(ticker);
    setView('analyze');
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
    <div className="flex h-screen bg-cerna-bg-primary">
      <Sidebar
        activeView={view}
        onSelectView={handleSelectView}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        activeSessionId={activeSessionId}
        positions={positions}
        cashAvailable={props.initialProfile?.cash_available ?? 0}
      />

      <MobileDrawer open={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)}>
        <Sidebar
          activeView={view}
          onSelectView={handleSelectView}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          activeSessionId={activeSessionId}
          positions={positions}
          cashAvailable={props.initialProfile?.cash_available ?? 0}
          variant="mobile"
        />
      </MobileDrawer>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between h-12 px-4 border-b border-cerna-border shrink-0">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-2 -ml-2 text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-cerna-text-tertiary hidden md:inline">{props.userEmail}</span>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-cerna-text-secondary hover:text-cerna-text-primary transition-smooth"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden relative">
          {view === 'chat' && (
            <AgentChat
              key={sessionId}
              sessionId={sessionId}
              initialMessages={historyMessages}
              positions={positions}
              watchlist={watchlist}
            />
          )}
          {view === 'screen' && (
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
              <ScreenMode key={sessionId} sessionId={sessionId} initialMessages={historyMessages} />
            </div>
          )}
          {view === 'analyze' && (
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
              <AnalyzeMode
                key={sessionId}
                sessionId={sessionId}
                initialTicker={analyzeTicker}
                positions={positions}
                watchlist={watchlist}
                initialMessages={historyMessages}
              />
            </div>
          )}
          {view === 'brief' && (
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
              <BriefMode key={sessionId} sessionId={sessionId} initialMessages={historyMessages} />
            </div>
          )}
          {view === 'portfolio' && (
            <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6">
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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
