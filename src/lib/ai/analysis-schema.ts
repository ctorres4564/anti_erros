import { z } from 'zod';
import { CARD_ACTIONS, LOW_CONFIDENCE_THRESHOLD, PROBABLE_ERROR_TYPES } from '@/config/ai';

/**
 * Remove marcação HTML/tags de um texto vindo do usuário. O conteúdo nunca é
 * tratado como HTML confiável — é sempre conteúdo educacional em texto puro.
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
 * Input da análise enviado pelo cliente autenticado.
 * Estritamente proibido: user_id, email, quota, quota_date, analysis_id,
 * model, error_type, card_action, confidence, role, created_at — nenhum
 * desses campos é aceito; a presença de qualquer campo extra rejeita o
 * payload inteiro (estratégia .strict()).
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

/** Frente/verso de um flashcard gerado. Nunca deve copiar a questão original integralmente. */
export const flashcardSchema = z.object({
  front: z.string().trim().min(3, 'Frente do card muito curta.').max(500, 'Frente do card muito longa.'),
  back: z.string().trim().min(3, 'Verso do card muito curto.').max(1500, 'Verso do card muito longo.'),
});

export type Flashcard = z.infer<typeof flashcardSchema>;

const outputBaseFields = {
  probableErrorType: z.enum(PROBABLE_ERROR_TYPES),
  confidence: z.number().min(0, 'confidence mínimo é 0.0').max(1, 'confidence máximo é 1.0'),
  reasoningSummary: z
    .string()
    .trim()
    .min(10, 'reasoningSummary muito curto para ser útil ao usuário.')
    .max(600, 'reasoningSummary deve ser uma justificativa curta, não uma transcrição de raciocínio.'),
  coreConcept: z.string().trim().min(2).max(200),
};

/**
 * Output estruturado do Gemini. Discriminated union por cardAction garante,
 * em nível de tipo e de validação, que:
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

// Garantia em tempo de compilação de que a lista de ações do schema bate com config/ai.ts
const _cardActionsCheck: readonly string[] = CARD_ACTIONS;
void _cardActionsCheck;

/**
 * Política de baixa confiança (defesa em profundidade, independente do prompt):
 * se confidence < LOW_CONFIDENCE_THRESHOLD e o modelo ainda assim propôs um
 * CREATE_*, a decisão de card é rebaixada para NO_CARD. A classificação da
 * causa provável (probableErrorType) é preservada — apenas a decisão de
 * flashcard é tratada de forma conservadora, para nunca gerar card "para
 * preencher saída" com baixa confiança.
 */
export function applyLowConfidencePolicy(output: AnalysisOutput): AnalysisOutput {
  if (output.confidence >= LOW_CONFIDENCE_THRESHOLD) {
    return output;
  }
  if (output.cardAction === 'NO_CARD') {
    return output;
  }
  return {
    ...output,
    cardAction: 'NO_CARD',
    card: null,
  };
}
