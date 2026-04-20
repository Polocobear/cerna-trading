import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('investment_strategy, display_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.investment_strategy) redirect('/dashboard');

  return (
    <OnboardingWizard
      userId={user.id}
      initialDisplayName={profile?.display_name ?? user.email?.split('@')[0] ?? ''}
    />
  );
}
