import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/features/layout/AppShell';
import type { Position, WatchlistItem, JournalEntry, Profile } from '@/types/portfolio';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: { mode?: string };
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

  const validModes = ['screen', 'analyze', 'brief', 'portfolio', 'ask'] as const;
  type ValidMode = (typeof validModes)[number];
  const initialMode: ValidMode = (validModes as readonly string[]).includes(searchParams.mode ?? '')
    ? (searchParams.mode as ValidMode)
    : 'screen';

  return (
    <AppShell
      initialProfile={profile}
      initialPositions={positions}
      initialWatchlist={watchlist}
      initialJournal={journal}
      userEmail={user.email ?? ''}
      initialMode={initialMode}
    />
  );
}
