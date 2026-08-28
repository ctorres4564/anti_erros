import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AuthenticatedAnalysisExperience } from '@/components/analysis/AuthenticatedAnalysisExperience';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete, getUserProfileData } from '@/services/onboarding';
import type { AnalysisHistoryItem } from '@/types/analysis';

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const [isComplete, profile, historyResult, cookieStore] = await Promise.all([
    isOnboardingComplete(user.id),
    getUserProfileData(user.id),
    supabase
      .from('analyses')
      .select('id, raw_question, error_type, recommended_action, card_action, discipline, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    cookies(),
  ]);

  if (!isComplete) redirect('/onboarding');

  const initialHistory: AnalysisHistoryItem[] = (historyResult.data ?? []).map((row) => ({
    id: row.id,
    question: row.raw_question,
    probableErrorType: row.error_type,
    recommendedAction: row.recommended_action,
    cardAction: row.card_action,
    discipline: row.discipline,
    createdAt: row.created_at,
  }));

  const displayName = profile?.fullName?.trim() || user.email || 'Estudante';
  const firstName = displayName.split(/\s+/)[0] || 'Estudante';

  return (
    <AuthenticatedAnalysisExperience
      firstName={firstName}
      hasPendingClaim={cookieStore.has('claim_token')}
      initialHistory={initialHistory}
      historyUnavailable={Boolean(historyResult.error)}
    />
  );
}
