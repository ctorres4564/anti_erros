/**
 * Configuração centralizada e imutável do motor de análise de IA (PRD v1.2).
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

export const ERROR_TYPE_LABELS: Record<ProbableErrorType, string> = {
  KNOWLEDGE_GAP: 'Lacuna de Conhecimento',
  CONCEPT_CONFUSION: 'Confusão Conceitual',
  EXCEPTION_MISSED: 'Exceção ou Condição Ignorada',
  APPLICATION_ERROR: 'Erro de Aplicação',
  READING_ERROR: 'Erro de Leitura/Interpretação',
  INSUFFICIENT_INFORMATION: 'Informações Insuficientes',
};

export const CARD_ACTIONS = [
  'CREATE_BASIC_CARD',
  'CREATE_DISCRIMINATION_CARD',
  'CREATE_EXCEPTION_CARD',
  'CREATE_APPLICATION_CARD',
  'NO_CARD',
] as const;

export type CardAction = (typeof CARD_ACTIONS)[number];

/**
 * Enum oficial de disciplinas para classificação pela IA (PRD v1.2).
 */
export const DISCIPLINES = [
  'Direito Constitucional',
  'Direito Administrativo',
  'Direito Civil',
  'Direito Penal',
  'Processo Civil',
  'Processo Penal',
  'Português',
  'Raciocínio Lógico-Matemático',
  'Matemática',
  'Informática',
  'Atualidades',
  'Legislação Específica',
  'Administração Pública',
  'Contabilidade',
  'Economia',
  'Estatística',
  'Outra',
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/**
 * Taxonomia estruturada da autopercepção do usuário sobre o erro (PRD v1.2).
 * NUNCA enviada ao prompt da IA.
 */
export const USER_ATTRIBUTIONS = [
  'NAO_SABIA_CONTEUDO',
  'CONFUNDI_CONCEITOS',
  'ESQUECI_EXCECAO',
  'ERRO_APLICACAO',
  'ERRO_LEITURA',
  'NAO_SEI',
] as const;

export type UserAttribution = (typeof USER_ATTRIBUTIONS)[number];

export const USER_ATTRIBUTION_LABELS: Record<UserAttribution, string> = {
  NAO_SABIA_CONTEUDO: 'Não sabia o conteúdo',
  CONFUNDI_CONCEITOS: 'Confundi conceitos parecidos',
  ESQUECI_EXCECAO: 'Sabia a regra, mas esqueci a exceção/condição',
  ERRO_APLICACAO: 'Sabia a teoria, mas errei na aplicação',
  ERRO_LEITURA: 'Li/interpretei errado',
  NAO_SEI: 'Não sei dizer',
};

/**
 * Mapeamento conceitual para cálculo de divergência/alinhamento com a autopercepção.
 * Não representa acurácia nem ground truth da IA.
 */
export const ATTRIBUTION_ERROR_TYPE_MAP: Record<UserAttribution, ProbableErrorType | null> = {
  NAO_SABIA_CONTEUDO: 'KNOWLEDGE_GAP',
  CONFUNDI_CONCEITOS: 'CONCEPT_CONFUSION',
  ESQUECI_EXCECAO: 'EXCEPTION_MISSED',
  ERRO_APLICACAO: 'APPLICATION_ERROR',
  ERRO_LEITURA: 'READING_ERROR',
  NAO_SEI: null,
};

export function calculateDivergence(userAttribution: UserAttribution, probableErrorType: ProbableErrorType): {
  isAligned: boolean;
  message: string;
} {
  const expectedType = ATTRIBUTION_ERROR_TYPE_MAP[userAttribution];
  if (userAttribution === 'NAO_SEI' || !expectedType) {
    return {
      isAligned: false,
      message: `Você indicou que não sabia identificar a causa; o diagnóstico sugere ${ERROR_TYPE_LABELS[probableErrorType]}.`,
    };
  }

  const isAligned = expectedType === probableErrorType;
  if (isAligned) {
    return {
      isAligned: true,
      message: `Sua percepção ("${USER_ATTRIBUTION_LABELS[userAttribution]}") está alinhada com o diagnóstico independente.`,
    };
  }

  return {
    isAligned: false,
    message: `Você achou que errou por "${USER_ATTRIBUTION_LABELS[userAttribution]}", mas a análise independente sugere ${ERROR_TYPE_LABELS[probableErrorType]}.`,
  };
}

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
 */
export const AI_MODEL = process.env.GEMINI_MODEL_NAME || 'gemini-3.7-flash';

/** Versão do template de prompt persistida junto de cada análise (rastreabilidade). */
export const PROMPT_VERSION = 'analysis-v2.0';

/** Cota diária de análises por usuário (MVP). Fonte única desta constante. */
export const DAILY_ANALYSIS_LIMIT = Number(process.env.DAILY_ANALYSIS_QUOTA) || 5;

/** TTL do lock de idempotência, em segundos. Já homologado na Sprint 1. */
export const IDEMPOTENCY_LOCK_TTL_SECONDS = Number(process.env.IDEMPOTENCY_LOCK_TTL_SECONDS) || 120;

/** TTL da análise pendente para resgate (24 horas). */
export const PENDING_ANALYSIS_TTL_HOURS = 24;

/**
 * Confiança mínima (0.0–1.0) para que a classificação da causa provável seja
 * considerada suficientemente segura. Abaixo disso, tratamento conservador:
 * preferir INSUFFICIENT_INFORMATION / NO_CARD.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Timeout explícito para a chamada ao Gemini.
 */
export const AI_REQUEST_TIMEOUT_MS = 45_000;

/** Número máximo de retries quando a resposta do modelo viola o schema estruturado. */
export const AI_MAX_SCHEMA_RETRIES = 1;
