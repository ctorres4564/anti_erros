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
