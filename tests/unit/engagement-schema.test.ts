import { describe, expect, it } from 'vitest';
import {
  activationEventSchema,
  analysisFeedbackSchema,
  disciplineConfirmationSchema,
} from '@/lib/engagement-schema';

describe('contratos de ativação da Sprint 5', () => {
  it('aceita somente disciplinas do enum controlado', () => {
    expect(disciplineConfirmationSchema.safeParse({ discipline: 'Direito Constitucional' }).success).toBe(true);
    expect(disciplineConfirmationSchema.safeParse({ discipline: 'Disciplina inventada' }).success).toBe(false);
  });

  it('aceita feedback mínimo e limita o comentário', () => {
    expect(analysisFeedbackSchema.safeParse({ rating: 'PARTIALLY', comment: 'A ação ajudou.' }).success).toBe(true);
    expect(analysisFeedbackSchema.safeParse({ rating: 'MAYBE' }).success).toBe(false);
    expect(analysisFeedbackSchema.safeParse({ rating: 'YES', comment: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rejeita eventos arbitrários e exige ownership verificável no resultado completo', () => {
    expect(activationEventSchema.safeParse({ eventName: 'prompt_dumped' }).success).toBe(false);
    expect(activationEventSchema.safeParse({ eventName: 'full_result_viewed' }).success).toBe(false);
    expect(activationEventSchema.safeParse({
      eventName: 'full_result_viewed',
      analysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
    }).success).toBe(true);
  });
});
