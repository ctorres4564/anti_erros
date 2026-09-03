/**
 * Logging estruturado e não sensível para o funcionamento server-side do claim.
 *
 * O tipo `ClaimLogFields` é a única superfície de escrita — por não incluir
 * campos como token, claim_ref completo, hash, e-mail ou conteúdo da questão,
 * não é possível logar esses dados através desta função por engano.
 */

export type ClaimLogEvent =
  | 'pending_preview_created'
  | 'pending_claim_started'
  | 'pending_claim_lookup'
  | 'pending_claim_validated'
  | 'pending_claim_rpc_executed'
  | 'pending_claim_analysis_resolved'
  | 'pending_claim_succeeded'
  | 'pending_claim_failed';

export interface ClaimLogFields {
  pendingAnalysisId?: string | null;
  analysisId?: string;
  stage?: string;
  status?: string;
  found?: boolean;
  errorKind?: string;
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
