import { createAdminClient } from '@/lib/supabase/admin';
import { AIAnalysisError, type AIAnalysisClient } from '@/lib/ai/gemini';
import { PROMPT_VERSION } from '@/lib/ai/analysis-prompt';
import type { AnalysisInput, AnalysisOutput } from '@/lib/ai/analysis-schema';
import { DAILY_ANALYSIS_LIMIT, IDEMPOTENCY_LOCK_TTL_SECONDS } from '@/config/ai';
import type { Json, Tables } from '@/types/database.types';

export interface ApiAnalysis {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  officialExplanation: string | null;
  probableErrorType: string;
  confidence: number;
  reasoningSummary: string;
  coreConcept: string;
  cardAction: string;
  card: { front: string; back: string } | null;
  modelVersion: string;
  createdAt: string;
}

export type AnalysisServiceResult =
  | { kind: 'SUCCESS'; replayed: false; analysis: ApiAnalysis }
  | { kind: 'SUCCESS'; replayed: true; analysis: ApiAnalysis }
  | { kind: 'PENDING' }
  | { kind: 'LIMIT_REACHED'; limit: number }
  | { kind: 'AI_FAILED'; code: string; message: string };

function toApiAnalysis(row: Tables<'analyses'>): ApiAnalysis {
  return {
    id: row.id,
    question: row.raw_question,
    userAnswer: row.user_answer,
    correctAnswer: row.correct_answer,
    officialExplanation: row.official_explanation,
    probableErrorType: row.error_type,
    confidence: row.ai_confidence,
    reasoningSummary: row.root_cause_explanation,
    coreConcept: row.learning_gap_concept,
    cardAction: row.card_action,
    card:
      row.suggested_flashcard_front && row.suggested_flashcard_back
        ? { front: row.suggested_flashcard_front, back: row.suggested_flashcard_back }
        : null,
    modelVersion: row.model_version,
    createdAt: row.created_at,
  };
}

async function logEvent(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  eventName: string,
  properties: Record<string, Json> = {}
) {
  await admin.from('events').insert({ user_id: userId, event_name: eventName, properties }).select().maybeSingle();
}

/**
 * Orquestra o fluxo transacional em 2 fases descrito na arquitetura:
 * Fase 1 (reserva atômica, RPC) -> chamada de IA fora de transação -> Fase 2
 * (conclusão ou falha, RPC). Nunca mantém transação de banco aberta durante a
 * chamada ao Gemini.
 */
export async function runAnalysisEngine(params: {
  userId: string;
  idempotencyKey: string;
  input: AnalysisInput;
  aiClient: AIAnalysisClient;
}): Promise<AnalysisServiceResult> {
  const { userId, idempotencyKey, input, aiClient } = params;
  const admin = createAdminClient();

  // ---- Fase 1: reserva atômica ----
  const { data: reserveData, error: reserveError } = await admin.rpc('reserve_analysis_slot', {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_ttl_seconds: IDEMPOTENCY_LOCK_TTL_SECONDS,
  });

  if (reserveError) {
    throw new Error(`Falha ao reservar vaga de análise: ${reserveError.message}`);
  }

  const reserve = reserveData as {
    status: 'RESERVED' | 'COMPLETED' | 'PENDING' | 'LIMIT_REACHED';
    lockId?: string;
    analysisId?: string;
    limit?: number;
  };

  if (reserve.status === 'LIMIT_REACHED') {
    return { kind: 'LIMIT_REACHED', limit: reserve.limit ?? DAILY_ANALYSIS_LIMIT };
  }

  if (reserve.status === 'PENDING') {
    return { kind: 'PENDING' };
  }

  if (reserve.status === 'COMPLETED') {
    const { data: existing, error: fetchError } = await admin
      .from('analyses')
      .select('*')
      .eq('id', reserve.analysisId as string)
      .maybeSingle();

    if (fetchError || !existing) {
      throw new Error('Análise já concluída anteriormente, mas não foi possível recuperá-la.');
    }

    return { kind: 'SUCCESS', replayed: true, analysis: toApiAnalysis(existing) };
  }

  // status === 'RESERVED': prossegue para a chamada de IA, fora de qualquer transação de banco.
  const lockId = reserve.lockId as string;
  await logEvent(admin, userId, 'analysis_started', { idempotencyKey });

  let aiOutput: AnalysisOutput;
  let modelVersion: string;
  try {
    const result = await aiClient.analyze(input);
    aiOutput = result.output;
    modelVersion = result.modelVersion;
  } catch (err) {
    // ---- Fase 2 (falha): estorna a reserva, nunca consome cota ----
    await admin.rpc('fail_analysis', { p_user_id: userId, p_lock_id: lockId });

    const code = err instanceof AIAnalysisError ? err.code : 'UNKNOWN';
    const message = err instanceof Error ? err.message : 'Falha desconhecida no motor de IA.';
    await logEvent(admin, userId, 'analysis_failed', { idempotencyKey, code });

    return { kind: 'AI_FAILED', code, message };
  }

  // ---- Fase 2 (sucesso): persiste e debita a cota ----
  const { data: completeData, error: completeError } = await admin.rpc('complete_analysis', {
    p_user_id: userId,
    p_lock_id: lockId,
    p_raw_question: input.question,
    p_user_answer: input.userAnswer,
    p_correct_answer: input.correctAnswer,
    // O gerador de tipos do Supabase não expressa nulabilidade de parâmetros
    // TEXT de função (a RPC aceita NULL normalmente em runtime); cast local documentado.
    p_official_explanation: (input.officialExplanation ?? null) as string,
    p_error_type: aiOutput.probableErrorType,
    p_root_cause_explanation: aiOutput.reasoningSummary,
    p_learning_gap_concept: aiOutput.coreConcept,
    p_card_action: aiOutput.cardAction,
    p_suggested_flashcard_front: (aiOutput.card?.front ?? null) as string,
    p_suggested_flashcard_back: (aiOutput.card?.back ?? null) as string,
    p_ai_confidence: aiOutput.confidence,
    p_model_version: modelVersion,
    p_prompt_version: PROMPT_VERSION,
  });

  if (completeError || !completeData) {
    // A análise da IA teve sucesso mas a persistência falhou: trata como falha (estorna e não expõe resultado não-persistido).
    await admin.rpc('fail_analysis', { p_user_id: userId, p_lock_id: lockId });
    return { kind: 'AI_FAILED', code: 'PERSISTENCE_ERROR', message: completeError?.message ?? 'Falha ao persistir análise.' };
  }

  const analysisId = (completeData as { analysisId: string }).analysisId;

  await logEvent(admin, userId, 'analysis_completed', {
    idempotencyKey,
    errorType: aiOutput.probableErrorType,
    cardAction: aiOutput.cardAction,
  });
  if (aiOutput.cardAction !== 'NO_CARD') {
    await logEvent(admin, userId, 'flashcard_generated', { idempotencyKey, cardAction: aiOutput.cardAction });
  }

  const { data: persisted } = await admin.from('analyses').select('*').eq('id', analysisId).maybeSingle();
  if (!persisted) {
    throw new Error('Análise persistida, mas não foi possível recuperá-la para resposta.');
  }

  return { kind: 'SUCCESS', replayed: false, analysis: toApiAnalysis(persisted) };
}
