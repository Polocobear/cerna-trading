import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/features/layout/AppShell';
import type { Position, WatchlistItem, JournalEntry, Profile } from '@/types/portfolio';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

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

  return (
    <AppShell
      initialProfile={profile}
      initialPositions={positions}
      initialWatchlist={watchlist}
      initialJournal={journal}
      userEmail={user.email ?? ''}
    />
  );
}
