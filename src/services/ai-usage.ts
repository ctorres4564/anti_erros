/**
 * Registro de consumo de IA — best-effort, sem tabela nova e sem migration.
 *
 * Usa a infraestrutura de eventos já existente:
 * - `public.events` (user_id) para chamadas autenticadas;
 * - `public.anonymous_events` (anonymous_id + pending_analysis_id) para o preview
 *   anônimo, permitindo relacionar o consumo ao usuário depois, via
 *   `pending_analyses.claimed_by_user_id`, sem armazenar nada pessoal.
 *
 * O nome de evento usado aqui NÃO está na lista sanitizada pelo trigger
 * `sanitize_anonymous_activation_event`, portanto as propriedades são preservadas.
 *
 * Nenhuma falha desta camada pode derrubar análise, preview ou explicação:
 * tudo é engolido e apenas logado sem conteúdo do usuário e sem segredos.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { toUsageEventProperties, type GeminiCallTelemetry } from '@/lib/ai/usage';

export const AI_USAGE_EVENT_NAME = 'ai_usage_recorded';

function warnFailure(scope: string, telemetry: GeminiCallTelemetry, detail: string): void {
  // Somente metadados técnicos: nunca prompt, texto gerado, e-mail ou chave.
  console.warn(`Falha ao registrar uso de IA (${scope}).`, {
    feature: telemetry.feature,
    outcome: telemetry.outcome,
    detail,
  });
}

/** Consumo de uma chamada feita em nome de um usuário autenticado. */
export async function recordAuthenticatedAiUsage(
  userId: string,
  telemetry: GeminiCallTelemetry
): Promise<void> {
  try {
    const { error } = await createAdminClient().from('events').insert({
      user_id: userId,
      event_name: AI_USAGE_EVENT_NAME,
      properties: toUsageEventProperties(telemetry),
    });
    if (error) warnFailure('authenticated', telemetry, error.message);
  } catch (error) {
    warnFailure('authenticated', telemetry, error instanceof Error ? error.message : 'erro desconhecido');
  }
}

/**
 * Consumo de uma chamada do preview anônimo. `pendingAnalysisId` é null quando a
 * chamada falhou antes de existir uma pending — o custo continua registrado.
 */
export async function recordAnonymousAiUsage(
  anonymousId: string,
  pendingAnalysisId: string | null,
  telemetry: GeminiCallTelemetry
): Promise<void> {
  try {
    const { error } = await createAdminClient().from('anonymous_events').insert({
      anonymous_id: anonymousId,
      event_name: AI_USAGE_EVENT_NAME,
      pending_analysis_id: pendingAnalysisId,
      properties: toUsageEventProperties(telemetry),
    });
    if (error) warnFailure('anonymous', telemetry, error.message);
  } catch (error) {
    warnFailure('anonymous', telemetry, error instanceof Error ? error.message : 'erro desconhecido');
  }
}
