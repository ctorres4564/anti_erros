/**
 * Logging estruturado e não sensível para o fluxo preview → login → claim.
 * Só existe para permitir diagnosticar, em produção, onde um claim se perde.
 *
 * O tipo `ClaimLogFields` é a única superfície de escrita — por não incluir
 * campos como token, claim_ref completo, hash, e-mail ou conteúdo da questão,
 * não é possível logar esses dados através desta função por engano.
 */

export type ClaimLogEvent =
  | 'pending_preview_created'
  | 'auth_confirm_redirect'
  | 'app_page_claim_state'
  | 'authenticated_analysis_mounted'
  | 'authenticated_claim_effect_started'
  | 'pending_claim_started'
  | 'pending_claim_lookup'
  | 'pending_claim_validated'
  | 'pending_claim_rpc_executed'
  | 'pending_claim_analysis_resolved'
  | 'pending_claim_succeeded'
  | 'pending_claim_failed';

/** Destinos possíveis do redirect pós-autenticação, como enum controlado. */
export type ClaimLogDestination =
  | 'app_with_claim'
  | 'app_without_claim'
  | 'onboarding_with_claim'
  | 'onboarding_without_claim'
  | 'other_internal_destination';

export interface ClaimLogFields {
  pendingAnalysisId?: string | null;
  analysisId?: string;
  stage?: string;
  status?: string;
  found?: boolean;
  errorKind?: string;
  hasClaimReference?: boolean;
  hasClaimRefParam?: boolean;
  claimRefStructurallyValid?: boolean;
  destination?: ClaimLogDestination;
}

const PENDING_ID_IN_REFERENCE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\./i;

/**
 * Extrai apenas o identificador do pending de uma referência de claim, para
 * fins de log. Nunca devolve a assinatura nem a referência completa, e não
 * depende de `crypto` — por isso pode ser usado também no cliente.
 */
export function safePendingAnalysisId(reference: string | null | undefined): string | null {
  if (!reference) return null;
  return PENDING_ID_IN_REFERENCE.exec(reference)?.[1] ?? null;
}

export function logClaimEvent(event: ClaimLogEvent, fields: ClaimLogFields = {}): void {
  console.log(
    JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    })
  );
}
