/**
 * Configuração centralizada e imutável do motor de análise de IA.
 * NUNCA hardcode limites, thresholds ou model IDs fora deste arquivo.
 */

export const PROBABLE_ERROR_TYPES = [
  'KNOWLEDGE_GAP',
  'CONCEPT_CONFUSION',
  'EXCEPTION_MISSED',
  'APPLICATION_ERROR',
  'READING_ERROR',
  'INSUFFICIENT_INFORMATION',
] as const;

export type ProbableErrorType = (typeof PROBABLE_ERROR_TYPES)[number];

export const CARD_ACTIONS = [
  'CREATE_BASIC_CARD',
  'CREATE_DISCRIMINATION_CARD',
  'CREATE_EXCEPTION_CARD',
  'CREATE_APPLICATION_CARD',
  'NO_CARD',
] as const;

export type CardAction = (typeof CARD_ACTIONS)[number];

/**
 * Mapa pedagógico inicial: correspondência típica (não mecânica) entre a
 * causa provável do erro e a ação de flashcard mais indicada. A IA pode se
 * afastar deste mapa quando o caso concreto justificar.
 */
export const PEDAGOGICAL_MAP: Record<ProbableErrorType, CardAction> = {
  KNOWLEDGE_GAP: 'CREATE_BASIC_CARD',
  CONCEPT_CONFUSION: 'CREATE_DISCRIMINATION_CARD',
  EXCEPTION_MISSED: 'CREATE_EXCEPTION_CARD',
  APPLICATION_ERROR: 'CREATE_APPLICATION_CARD',
  READING_ERROR: 'NO_CARD',
  INSUFFICIENT_INFORMATION: 'NO_CARD',
};

/**
 * Modelo Gemini utilizado em produção (server-side apenas).
 * `gemini-2.5-flash` — candidato original citado na especificação — retornou
 * HTTP 404 ("no longer available to new users") para a API key usada no
 * benchmark desta sprint; ver docs/SPRINT_3_MODEL_BENCHMARK.md para o
 * problema completo e a decisão. O fallback abaixo reflete o modelo
 * efetivamente selecionado pelo benchmark real.
 */
export const AI_MODEL = process.env.GEMINI_MODEL_NAME || 'gemini-3.7-flash';

/** Versão do template de prompt persistida junto de cada análise (rastreabilidade). */
export const PROMPT_VERSION = 'analysis-v1';

/** Cota diária de análises por usuário (MVP). Fonte única desta constante. */
export const DAILY_ANALYSIS_LIMIT = Number(process.env.DAILY_ANALYSIS_QUOTA) || 5;

/** TTL do lock de idempotência, em segundos. Já homologado na Sprint 1. */
export const IDEMPOTENCY_LOCK_TTL_SECONDS = Number(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS) || 120;

/**
 * Confiança mínima (0.0–1.0) para que a classificação da causa provável seja
 * considerada suficientemente segura. Abaixo disso, tratamento conservador:
 * preferir INSUFFICIENT_INFORMATION / NO_CARD.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Timeout explícito para a chamada ao Gemini. Nunca deixar a requisição
 * pendurada. 30s reflete a latência real observada nos modelos gemini-3.x
 * ("thinking" variável): smoke tests medidos entre ~1.8s e ~16.7s por
 * chamada em condições normais (ver docs/SPRINT_3_MODEL_BENCHMARK.md).
 */
export const AI_REQUEST_TIMEOUT_MS = 45_000;

/** Número máximo de retries quando a resposta do modelo viola o schema estruturado. */
export const AI_MAX_SCHEMA_RETRIES = 1;
