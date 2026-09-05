import { ERROR_TYPE_LABELS, type ProbableErrorType } from '@/config/ai';

const FALLBACK_ERROR_LABEL = 'Causa ainda não identificada';

export function getErrorTypeLabel(errorType: string): string {
  return ERROR_TYPE_LABELS[errorType as ProbableErrorType] ?? FALLBACK_ERROR_LABEL;
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return 'Confiança operacional mais alta';
  if (confidence >= 0.6) return 'Confiança operacional moderada';
  return 'Evidências ainda insuficientes';
}

export function getCardDecisionLabel(cardAction: string): string {
  return cardAction === 'NO_CARD' ? 'Sem flashcard recomendado' : 'Flashcard recomendado';
}

export function getAlignmentMessage(isAligned: boolean): string {
  return isAligned
    ? 'Sua percepção e a análise apontam para o mesmo tipo provável de dificuldade.'
    : 'Sua percepção e a análise apontam para possibilidades diferentes. Vale revisar o caso com atenção.';
}

export function toConservativeLanguage(value: string): string {
  return value
    .replace(/a ia determinou que/gi, 'com base nas informações fornecidas,')
    .replace(/esta foi a causa do seu erro/gi, 'o erro pode estar relacionado a')
    .replace(/o diagnóstico está fechado\.?/gi, 'a análise permanece provisória.')
    .replace(/\bdiagnóstico\b/gi, 'análise');
}

export function formatAnalysisDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function truncateQuestion(value: string, maxLength = 110): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, maxLength - 1).trimEnd();
  const lastSpace = candidate.lastIndexOf(' ');
  const safeCut = lastSpace >= Math.floor(maxLength * 0.6) ? candidate.slice(0, lastSpace) : candidate;
  return `${safeCut}…`;
}

/**
 * Complemento determinístico de execução para a recomendação da IA.
 *
 * Não substitui nem reescreve `recommendedAction`: apenas ACRESCENTA um passo
 * curto de execução/verificação quando a recomendação diz o que revisar mas não
 * fecha "o que faço agora e como sei que terminei?".
 *
 * Regras:
 * - camada de APRESENTAÇÃO apenas; nada aqui é persistido nem enviado à IA;
 * - nunca gera conteúdo disciplinar novo — o complemento é sempre a mesma
 *   instrução de comportamento, jamais um fato sobre a matéria;
 * - se a recomendação já traz uma ação concreta verificável, não complementa.
 */

/** Verbos imperativos que já configuram ação concreta e verificável. */
const CONCRETE_ACTION_VERBS = [
  'sublinhe',
  'destaque',
  'grife',
  'refaça',
  'reescreva',
  'escreva',
  'anote',
  'compare',
  'monte',
  'faça',
  'resolva',
  'balanceie',
  'identifique',
  'calcule',
  'divida',
  'multiplique',
  'aplique',
  'siga',
  'pratique',
  'treine',
  'classifique',
  'separe',
  'liste',
  'desenhe',
  'teste',
] as const;

/**
 * Passo genérico de execução + verificação. Fixo e sem conteúdo de matéria:
 * descreve apenas o comportamento a executar.
 */
export const EXECUTION_FOLLOW_UP =
  'Depois, refaça esta questão sem consultar a resolução e confirme se consegue explicar por que a resposta correta está certa.';

/**
 * Passo específico para INSUFFICIENT_INFORMATION. Nesses casos o diagnóstico
 * ficou inconclusivo justamente porque faltou evidência sobre COMO o estudante
 * chegou à resposta — então o passo pede que ele torne o raciocínio explícito.
 * Deliberadamente conservador: não afirma causa nem promete que o sistema vai
 * descobri-la.
 */
export const INSUFFICIENT_INFORMATION_FOLLOW_UP =
  'Refaça a questão e, antes de conferir a resolução, escreva em uma frase como você chegou à resposta. Isso fornece mais informação para entender o que aconteceu.';

/**
 * Detecta se a recomendação já contém um passo concreto (verbo imperativo de
 * ação). Gerúndios ("revisando", "destacando") NÃO contam: descrevem um modo de
 * estudar, não um passo que o estudante saiba quando terminou.
 */
export function hasConcreteAction(recommendedAction: string): boolean {
  const normalized = recommendedAction
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  return CONCRETE_ACTION_VERBS.some((verb) => {
    const bare = verb.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return new RegExp(`(^|[^a-z])${bare}([^a-z]|$)`).test(normalized);
  });
}

export interface PresentedRecommendation {
  /** Texto original da IA, preservado sem alteração. */
  action: string;
  /** Passo determinístico adicional; null quando a ação já é concreta. */
  followUp: string | null;
}

export interface BuildRecommendationParams {
  recommendedAction: string | null | undefined;
  fallbackAction: string;
  /** Usado só para escolher o passo determinístico; nunca altera a ação da IA. */
  probableErrorType?: string;
}

/**
 * Monta a recomendação a exibir. Recebe apenas dados já existentes e devolve o
 * texto de apresentação — o objeto da análise nunca é modificado.
 */
export function buildActionableRecommendation(
  params: BuildRecommendationParams
): PresentedRecommendation {
  const action = (params.recommendedAction ?? '').trim() || params.fallbackAction;

  if (hasConcreteAction(action)) return { action, followUp: null };

  return {
    action,
    followUp:
      params.probableErrorType === 'INSUFFICIENT_INFORMATION'
        ? INSUFFICIENT_INFORMATION_FOLLOW_UP
        : EXECUTION_FOLLOW_UP,
  };
}
