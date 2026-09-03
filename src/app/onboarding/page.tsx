import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ claim_ref?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const isComplete = await isOnboardingComplete(user.id);
  if (isComplete) {
    redirect(params.claim_ref ? `/app?claim_ref=${encodeURIComponent(params.claim_ref)}` : '/app');
  }

  return <OnboardingForm claimReference={params.claim_ref ?? null} />;
}
