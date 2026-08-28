import { z } from 'zod';
import { DISCIPLINES } from '@/config/ai';

export const disciplineConfirmationSchema = z
  .object({ discipline: z.enum(DISCIPLINES) })
  .strict();

export const FEEDBACK_RATINGS = ['YES', 'PARTIALLY', 'NO'] as const;
export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number];

export const analysisFeedbackSchema = z
  .object({
    rating: z.enum(FEEDBACK_RATINGS),
    comment: z
      .string()
      .trim()
      .max(500, 'O comentário deve ter no máximo 500 caracteres.')
      .transform((value) => value || null)
      .optional(),
  })
  .strict();

export const ACTIVATION_EVENTS = [
  'auth_gate_shown',
  'full_result_viewed',
] as const;

export const activationEventSchema = z
  .object({
    eventName: z.enum(ACTIVATION_EVENTS),
    analysisId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.eventName === 'full_result_viewed' && !value.analysisId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['analysisId'], message: 'analysisId é obrigatório.' });
    }
  });
