import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete, getUserProfileData } from '@/services/onboarding';
import { ContaView } from '@/components/ContaView';

export default async function ContaPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const isComplete = await isOnboardingComplete(user.id);
  if (!isComplete) {
    redirect('/onboarding');
  }

  const profile = await getUserProfileData(user.id);
  if (!profile) {
    redirect('/onboarding');
  }

  return (
    <ContaView
      initialProfile={{
        fullName: profile.fullName,
        email: profile.email,
        marketingConsented: profile.marketingConsented,
      }}
    />
  );
}
