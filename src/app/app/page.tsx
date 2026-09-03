import { redirect } from 'next/navigation';
import { AuthenticatedAnalysisExperience } from '@/components/analysis/AuthenticatedAnalysisExperience';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete, getUserProfileData } from '@/services/onboarding';
import type { AnalysisHistoryItem } from '@/types/analysis';
import { parseClaimReference } from '@/lib/security/claim-token';
import { logClaimEvent, safePendingAnalysisId } from '@/lib/observability/claim-log';

export default async function AppPage({
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

  const [isComplete, profile, historyResult] = await Promise.all([
    isOnboardingComplete(user.id),
    getUserProfileData(user.id),
    supabase
      .from('analyses')
      .select('id, raw_question, error_type, recommended_action, card_action, discipline, discipline_confirmed, created_at')
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  if (!isComplete) redirect('/onboarding');

  const initialHistory: AnalysisHistoryItem[] = (historyResult.data ?? []).map((row) => ({
    id: row.id,
    question: row.raw_question,
    probableErrorType: row.error_type,
    recommendedAction: row.recommended_action,
    cardAction: row.card_action,
    discipline: row.discipline,
    confirmedDiscipline: row.discipline_confirmed,
    createdAt: row.created_at,
  }));

  const displayName = profile?.fullName?.trim() || user.email || 'Estudante';
  const firstName = displayName.split(/\s+/)[0] || 'Estudante';
  // Só validamos o formato estrutural aqui. A verificação de segurança real
  // (referência assinada contra o cookie de posse do pending) acontece em
  // /api/pending-analyses/claim — nunca decidimos aqui se o claim é legítimo,
  // para não descartar silenciosamente uma referência válida por o cookie
  // não estar visível nesta requisição específica.
  const claimReference =
    params.claim_ref && parseClaimReference(params.claim_ref) ? params.claim_ref : null;

  logClaimEvent('app_page_claim_state', {
    hasClaimRefParam: Boolean(params.claim_ref),
    claimRefStructurallyValid: Boolean(claimReference),
    pendingAnalysisId: safePendingAnalysisId(claimReference),
  });

  return (
    <AuthenticatedAnalysisExperience
      firstName={firstName}
      claimReference={claimReference}
      initialHistory={initialHistory}
      historyUnavailable={Boolean(historyResult.error)}
    />
  );
}
