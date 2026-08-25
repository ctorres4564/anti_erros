import { z } from 'zod';
import {
  CARD_ACTIONS,
  DISCIPLINES,
  LOW_CONFIDENCE_THRESHOLD,
  PROBABLE_ERROR_TYPES,
  USER_ATTRIBUTIONS,
} from '@/config/ai';

/**
 * Remove marcação HTML/tags de um texto vindo do usuário.
 */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizedText(min: number, max: number, requiredMessage: string) {
  return z
    .string({ required_error: requiredMessage })
    .trim()
    .min(1, { message: requiredMessage })
    .transform(stripHtml)
    .pipe(
      z
        .string()
        .min(min, { message: `Deve ter pelo menos ${min} caracteres.` })
        .max(max, { message: `Não pode exceder ${max} caracteres.` })
    );
}

/**
 * Payload estruturado enviado pelo cliente na rota de análise anônima.
 */
export const anonymousAnalysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    userAttribution: z.enum(USER_ATTRIBUTIONS, {
      required_error: 'A autopercepção da causa do erro é obrigatória.',
    }),
    officialExplanation: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : value),
      z
        .string()
        .trim()
        .transform(stripHtml)
        .pipe(z.string().max(4000, { message: 'A explicação oficial não pode exceder 4000 caracteres.' }))
        .optional()
    ),
    turnstileToken: z.string().optional(),
  })
  .strict();

export type AnonymousAnalysisInput = z.infer<typeof anonymousAnalysisInputSchema>;

/**
 * Payload estruturado enviado pelo cliente na rota autenticada.
 */
export const authenticatedAnalysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    userAttribution: z.enum(USER_ATTRIBUTIONS).default('NAO_SEI'),
    officialExplanation: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : value),
      z
        .string()
        .trim()
        .transform(stripHtml)
        .pipe(z.string().max(4000, { message: 'A explicação oficial não pode exceder 4000 caracteres.' }))
        .optional()
    ),
  })
  .strict();

export type AuthenticatedAnalysisInput = z.infer<typeof authenticatedAnalysisInputSchema>;

/**
 * Input fornecido ao Adapter do Gemini.
 * PROIBIDO incluir userAttribution, user_id, turnstile, email ou dados de identidade.
 */
export const analysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    officialExplanation: z.preprocess(
      (value) => (value === '' || value === null || value === undefined ? undefined : value),
      z
        .string()
        .trim()
        .transform(stripHtml)
        .pipe(z.string().max(4000, { message: 'A explicação oficial não pode exceder 4000 caracteres.' }))
        .optional()
    ),
  })
  .strict();

export type AnalysisInput = z.infer<typeof analysisInputSchema>;

/** Validação do header Idempotency-Key: obrigatoriamente um UUID. */
export const idempotencyKeySchema = z.string().uuid({ message: 'Idempotency-Key deve ser um UUID válido.' });

/** Validação do payload de Claim de análise pendente. */
export const claimPendingSchema = z
  .object({
    claimToken: z.string().min(16, 'Token de resgate inválido.'),
  })
  .strict();

export type ClaimPendingInput = z.infer<typeof claimPendingSchema>;

/** Frente/verso de um flashcard gerado. */
export const flashcardSchema = z.object({
  front: z.string().trim().min(3, 'Frente do card muito curta.').max(500, 'Frente do card muito longa.'),
  back: z.string().trim().min(3, 'Verso do card muito curto.').max(1500, 'Verso do card muito longo.'),
});

export type Flashcard = z.infer<typeof flashcardSchema>;

const outputBaseFields = {
  discipline: z.enum(DISCIPLINES),
  probableErrorType: z.enum(PROBABLE_ERROR_TYPES),
  confidence: z.number().min(0, 'confidence mínimo é 0.0').max(1, 'confidence máximo é 1.0'),
  reasoningSummary: z
    .string()
    .trim()
    .min(10, 'reasoningSummary muito curto.')
    .max(600, 'reasoningSummary deve ser uma justificativa curta.'),
  recommendedAction: z
    .string()
    .trim()
    .min(10, 'recommendedAction muito curta.')
    .max(600, 'recommendedAction deve ser uma conduta prática.'),
  coreConcept: z.string().trim().min(2).max(200),
};

/**
 * Output estruturado do Gemini. Discriminated union por cardAction:
 *   - cardAction = NO_CARD           => card = null
 *   - cardAction = CREATE_*          => card != null (front/back obrigatórios)
 */
export const analysisOutputSchema = z.discriminatedUnion('cardAction', [
  z.object({ ...outputBaseFields, cardAction: z.literal('NO_CARD'), card: z.null() }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_BASIC_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_DISCRIMINATION_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_EXCEPTION_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_APPLICATION_CARD'), card: flashcardSchema }),
]);

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

/**
 * Política de baixa confiança (PRD v1.2):
 * se confidence < LOW_CONFIDENCE_THRESHOLD:
 * - probableErrorType rebaixado para INSUFFICIENT_INFORMATION
 * - cardAction rebaixado para NO_CARD (card = null)
 * - recommendedAction mantido com instrução útil
 */
export function applyLowConfidencePolicy(output: AnalysisOutput): AnalysisOutput {
  if (output.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return output;
  }

  return {
    ...output,
    probableErrorType: 'INSUFFICIENT_INFORMATION',
    cardAction: 'NO_CARD',
    card: null,
    recommendedAction:
      output.recommendedAction ||
      'Revise o enunciado e o gabarito oficial com atenção para identificar os pontos de dúvida específicos.',
  };
}
