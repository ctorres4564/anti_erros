import { createAdminClient } from '@/lib/supabase/admin';
import type { AIAnalysisClient } from '@/lib/ai/gemini';
import { PROMPT_VERSION } from '@/config/ai';
import type { AnonymousAnalysisInput } from '@/lib/ai/analysis-schema';
import { calculateDivergence, type UserAttribution } from '@/config/ai';
import { generateClaimToken, hashClaimToken, hashIpAddress } from '@/lib/security/claim-token';
import { validateTurnstileToken } from '@/lib/security/turnstile';
import { checkRateLimit } from '@/lib/security/rate-limit';
import type { ApiAnalysis } from './analysis';
import type { Tables } from '@/types/database.types';
import { recordActivationEvent } from './activation';

export interface AnonymousPreviewResult {
  anonymousId: string;
  claimToken: string;
  probableErrorType: string;
  concept: string;
  discipline: string;
  divergenceMessage: string;
  isAligned: boolean;
  aiUserAgreement: boolean;
}

export type AnonymousPreviewServiceResult =
  | { kind: 'SUCCESS'; preview: AnonymousPreviewResult }
  | { kind: 'TURNSTILE_FAILED'; message: string }
  | { kind: 'RATE_LIMITED'; message: string }
  | { kind: 'AI_FAILED'; code: string; message: string };

export type ClaimServiceResult =
  | { kind: 'SUCCESS'; analysis: ApiAnalysis }
  | { kind: 'NOT_FOUND'; message: string }
  | { kind: 'ALREADY_CLAIMED'; message: string }
  | { kind: 'EXPIRED'; message: string }
  | { kind: 'LIMIT_REACHED'; limit: number }
  | { kind: 'ERROR'; message: string };

function toApiAnalysis(row: Tables<'analyses'>): ApiAnalysis {
  return {
    id: row.id,
    question: row.raw_question,
    userAnswer: row.user_answer,
    correctAnswer: row.correct_answer,
    studentReasoning: row.student_reasoning,
    discipline: row.discipline,
    confirmedDiscipline: row.discipline_confirmed,
    disciplineConfirmedAt: row.discipline_confirmed_at,
    probableErrorType: row.error_type,
    confidence: row.ai_confidence,
    reasoningSummary: row.root_cause_explanation,
    recommendedAction: row.recommended_action,
    coreConcept: row.learning_gap_concept,
    cardAction: row.card_action,
    card:
      row.suggested_flashcard_front && row.suggested_flashcard_back
        ? { front: row.suggested_flashcard_front, back: row.suggested_flashcard_back }
        : null,
    modelVersion: row.model_version,
    userAttribution: row.user_attribution,
    aiUserAgreement: row.ai_user_agreement,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  };
}

/**
 * Executa a análise anônima parcial (PRD v1.2):
 * 1. Valida Turnstile e Rate Limit.
 * 2. Chama IA com 1 ÚNICA INFERÊNCIA completa (userAttribution é EXCLUÍDA do prompt!).
 * 3. Persiste o resultado completo em pending_analyses com claim_token_hash.
 * 4. Retorna a projeção parcial e mantém o claimToken apenas para transporte em cookie HttpOnly.
 */
export async function createAnonymousPendingAnalysis(params: {
  input: AnonymousAnalysisInput;
  anonymousId: string;
  clientIp?: string;
  aiClient: AIAnalysisClient;
}): Promise<AnonymousPreviewServiceResult> {
  const { input, anonymousId, clientIp, aiClient } = params;
  const admin = createAdminClient();

  // 1. Validação de Turnstile
  const turnstileRes = await validateTurnstileToken(input.turnstileToken, clientIp);
  if (!turnstileRes.success) {
    return {
      kind: 'TURNSTILE_FAILED',
      message: turnstileRes.error || 'Falha na verificação de segurança anti-robô.',
    };
  }

  // 2. Rate Limit (por anonymousId e IP HMAC)
  const anonRate = checkRateLimit(`anon_${anonymousId}`, 5, 24 * 60 * 60 * 1000);
  if (!anonRate.allowed) {
    return {
      kind: 'RATE_LIMITED',
      message: 'Você atingiu o limite de análises anônimas para hoje. Cadastre-se gratuitamente para continuar.',
    };
  }

  const ipHmac = clientIp ? hashIpAddress(clientIp) : null;
  if (ipHmac) {
    const ipRate = checkRateLimit(`ip_${ipHmac}`, 20, 60 * 60 * 1000);
    if (!ipRate.allowed) {
      return {
        kind: 'RATE_LIMITED',
        message: 'Muitas requisições originadas deste endereço. Tente novamente mais tarde.',
      };
    }
  }

  // Registrar evento de início
  await admin.from('anonymous_events').insert({
    anonymous_id: anonymousId,
    event_name: 'analysis_form_started',
    properties: {},
  });

  // 3. Chamada de IA (userAttribution é EXCLUÍDA do payload da IA!)
  let aiResult;
  try {
    aiResult = await aiClient.analyze({
      question: input.question,
      userAnswer: input.userAnswer,
      correctAnswer: input.correctAnswer,
      studentReasoning: input.studentReasoning,
    });
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'UNKNOWN';
    const message = err instanceof Error ? err.message : 'Falha no motor de IA.';
    return { kind: 'AI_FAILED', code, message };
  }

  const { output, modelVersion, usage } = aiResult;
  const claimToken = generateClaimToken();
  const claimTokenHash = hashClaimToken(claimToken);

  // 4. Persistir em pending_analyses
  const { data: pending, error: insertError } = await admin
    .from('pending_analyses')
    .insert({
      anonymous_id: anonymousId,
      claim_token_hash: claimTokenHash,
      question: input.question,
      user_answer: input.userAnswer,
      correct_answer: input.correctAnswer,
      user_attribution: input.userAttribution,
      official_explanation: null,
      student_reasoning: input.studentReasoning ?? null,
      discipline: output.discipline,
      concept: output.coreConcept,
      probable_error_type: output.probableErrorType,
      confidence: output.confidence,
      reasoning_summary: output.reasoningSummary,
      recommended_action: output.recommendedAction,
      card_action: output.cardAction,
      suggested_flashcard_front: output.card?.front ?? null,
      suggested_flashcard_back: output.card?.back ?? null,
      model_version: modelVersion,
      prompt_version: PROMPT_VERSION,
      latency_ms: usage.latencyMs,
      ip_hmac: ipHmac,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (insertError || !pending) {
    throw new Error(`Falha ao registrar análise pendente: ${insertError?.message}`);
  }

  // 5. Telemetria
  await admin.from('anonymous_events').insert({
    anonymous_id: anonymousId,
    event_name: 'analysis_preview_completed',
    pending_analysis_id: pending.id,
    properties: {},
  });

  // 6. Cálculo de divergência com a autopercepção
  const div = calculateDivergence(input.userAttribution as UserAttribution, output.probableErrorType);

  return {
    kind: 'SUCCESS',
    preview: {
      anonymousId,
      claimToken,
      probableErrorType: output.probableErrorType,
      concept: output.coreConcept,
      discipline: output.discipline,
      divergenceMessage: div.message,
      isAligned: div.isAligned,
      aiUserAgreement: div.isAligned,
    },
  };
}

/**
 * Resgata a análise pendente após o usuário autenticar-se e concluir o onboarding.
 * Executa de forma atômica e idempotente via RPC (service_role), sem chamar o Gemini novamente.
 */
export async function claimPendingAnalysisForUser(params: {
  userId: string;
  claimToken: string;
}): Promise<ClaimServiceResult> {
  const { userId, claimToken } = params;
  const admin = createAdminClient();
  const claimTokenHash = hashClaimToken(claimToken);

  const { data, error } = await admin.rpc('claim_pending_analysis', {
    p_user_id: userId,
    p_claim_token_hash: claimTokenHash,
  });

  if (error) {
    return { kind: 'ERROR', message: `Erro ao resgatar análise: ${error.message}` };
  }

  const result = data as {
    status: 'CLAIMED' | 'NOT_FOUND' | 'ALREADY_CLAIMED' | 'EXPIRED' | 'LIMIT_REACHED';
    analysis_id?: string;
    message?: string;
    limit?: number;
  };

  if (result.status === 'NOT_FOUND') {
    return { kind: 'NOT_FOUND', message: result.message || 'Análise pendente não encontrada.' };
  }

  if (result.status === 'ALREADY_CLAIMED') {
    return { kind: 'ALREADY_CLAIMED', message: result.message || 'Esta análise já foi resgatada.' };
  }

  if (result.status === 'EXPIRED') {
    return { kind: 'EXPIRED', message: result.message || 'Esta análise expirou (limite de 24 horas).' };
  }

  if (result.status === 'LIMIT_REACHED') {
    return { kind: 'LIMIT_REACHED', limit: result.limit ?? 5 };
  }

  // Buscar a análise definitiva criada
  const { data: analysis, error: fetchErr } = await admin
    .from('analyses')
    .select('*')
    .eq('id', result.analysis_id as string)
    .single();

  if (fetchErr || !analysis) {
    throw new Error('Análise resgatada com sucesso mas não pôde ser recuperada.');
  }

  await recordActivationEvent(userId, 'analysis_claimed', { analysisId: analysis.id });

  return {
    kind: 'SUCCESS',
    analysis: toApiAnalysis(analysis),
  };
}
