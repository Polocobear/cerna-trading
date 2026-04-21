import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell, type ViewId } from '@/features/layout/AppShell';
import type { Position, WatchlistItem, JournalEntry, Profile } from '@/types/portfolio';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: { mode?: string; view?: string };
}

const VALID_VIEWS: readonly ViewId[] = ['dashboard', 'chat', 'portfolio'] as const;

function resolveInitialView(raw: string | undefined): ViewId {
  if (raw === 'ask') return 'chat';
  if (raw === 'screen' || raw === 'analyze' || raw === 'brief') return 'chat';
  if (raw && (VALID_VIEWS as readonly string[]).includes(raw)) return raw as ViewId;
  return 'dashboard';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profileCheck } = await supabase
    .from('profiles')
    .select('investment_strategy')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileCheck?.investment_strategy) redirect('/onboarding');

  const [positionsRes, watchlistRes, journalRes, profileRes] = await Promise.all([
    supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('trade_journal')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
  ]);

  const positions = (positionsRes.data ?? []) as Position[];
  const watchlist = (watchlistRes.data ?? []) as WatchlistItem[];
  const journal = (journalRes.data ?? []) as JournalEntry[];
  const profile = (profileRes.data ?? null) as Profile | null;

  const initialView = resolveInitialView(searchParams.view ?? searchParams.mode);

  return (
    <AppShell
      initialProfile={profile}
      initialPositions={positions}
      initialWatchlist={watchlist}
      initialJournal={journal}
      userEmail={user.email ?? ''}
      userId={user.id}
      initialView={initialView}
    />
  );
}
