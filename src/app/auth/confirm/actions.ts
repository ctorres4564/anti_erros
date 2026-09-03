'use server';

import { redirect } from 'next/navigation';
import { getSafePostAuthPath } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';
import { recordActivationEvent } from '@/services/activation';
import { isOnboardingComplete } from '@/services/onboarding';
import { parseClaimReference } from '@/lib/security/claim-token';
import {
  logClaimEvent,
  safePendingAnalysisId,
  type ClaimLogDestination,
} from '@/lib/observability/claim-log';

const INVALID_LINK_PATH = '/login?auth_error=link_invalid';

/** Traduz o destino real em um rótulo controlado, sem expor a URL completa. */
function resolveRedirectDestination(
  onboardingComplete: boolean,
  destination: string,
  claimReference: string | null
): ClaimLogDestination {
  const withClaim = Boolean(claimReference);

  if (!onboardingComplete) {
    return withClaim ? 'onboarding_with_claim' : 'onboarding_without_claim';
  }

  if (destination !== '/app') return 'other_internal_destination';

  return withClaim ? 'app_with_claim' : 'app_without_claim';
}

// Só executa a validação (e o consumo de uso único) do token quando o usuário
// aciona esta Server Action por clique explícito — nunca no GET que renderiza
// a página de confirmação, para não ser consumido por pré-busca automática
// (scanners de segurança de e-mail, antivírus de gateway, etc.).
export async function confirmMagicLink(formData: FormData) {
  const tokenHashField = formData.get('token_hash');
  const typeField = formData.get('type');
  const nextField = formData.get('next');
  const claimReferenceField = formData.get('claim_ref');

  const tokenHash = typeof tokenHashField === 'string' ? tokenHashField : null;
  const type = typeof typeField === 'string' ? typeField : null;
  const destination = getSafePostAuthPath(typeof nextField === 'string' ? nextField : null);
  const claimReference =
    typeof claimReferenceField === 'string' && parseClaimReference(claimReferenceField)
      ? claimReferenceField
      : null;

  if (!tokenHash || tokenHash.length > 512 || type !== 'email') {
    redirect(INVALID_LINK_PATH);
  }

  let verifiedUserId: string | null = null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });

    if (error || !data.user) {
      console.warn('Falha ao validar Magic Link.', {
        code: error && 'code' in error ? error.code : 'otp_verification_failed',
      });
    } else {
      verifiedUserId = data.user.id;
    }
  } catch {
    console.warn('Falha inesperada ao validar Magic Link.');
  }

  if (!verifiedUserId) {
    redirect(INVALID_LINK_PATH);
  }

  const onboardingComplete = await isOnboardingComplete(verifiedUserId);
  await recordActivationEvent(verifiedUserId, 'auth_completed');

  const claimQuery = claimReference
    ? `?claim_ref=${encodeURIComponent(claimReference)}`
    : '';
  const postAuthDestination = destination === '/app' ? `/app${claimQuery}` : destination;

  logClaimEvent('auth_confirm_redirect', {
    hasClaimReference: Boolean(claimReference),
    pendingAnalysisId: safePendingAnalysisId(claimReference),
    destination: resolveRedirectDestination(onboardingComplete, destination, claimReference),
  });

  redirect(onboardingComplete ? postAuthDestination : `/onboarding${claimQuery}`);
}
