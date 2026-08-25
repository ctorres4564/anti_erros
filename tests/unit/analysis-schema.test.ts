import { describe, it, expect } from 'vitest';
import {
  analysisInputSchema,
  analysisOutputSchema,
  applyLowConfidencePolicy,
  idempotencyKeySchema,
  type AnalysisOutput,
} from '@/lib/ai/analysis-schema';
import { LOW_CONFIDENCE_THRESHOLD } from '@/config/ai';

describe('analysisInputSchema', () => {
  const validInput = {
    question: 'Qual é a capital da França e por que ela é importante?',
    userAnswer: 'Lyon',
    correctAnswer: 'Paris',
  };

  it('aceita um input válido mínimo (sem officialExplanation)', () => {
    const result = analysisInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('aceita officialExplanation opcional', () => {
    const result = analysisInputSchema.safeParse({ ...validInput, officialExplanation: 'Paris é a capital desde...' });
    expect(result.success).toBe(true);
  });

  it('trata officialExplanation vazia como ausente', () => {
    const result = analysisInputSchema.safeParse({ ...validInput, officialExplanation: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.officialExplanation).toBeUndefined();
    }
  });

  it.each(['question', 'userAnswer', 'correctAnswer'])('rejeita quando %s está ausente', (field) => {
    const payload = { ...validInput };
    delete (payload as Record<string, unknown>)[field];
    const result = analysisInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it.each(['question', 'userAnswer', 'correctAnswer'])('rejeita %s vazio', (field) => {
    const result = analysisInputSchema.safeParse({ ...validInput, [field]: '' });
    expect(result.success).toBe(false);
  });

  it('aplica trim e remove marcação HTML do conteúdo', () => {
    const result = analysisInputSchema.safeParse({
      ...validInput,
      question: '  <b>Qual</b> é a <i>capital</i> da França?  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question).not.toContain('<');
      expect(result.data.question).not.toContain('>');
      expect(result.data.question.startsWith(' ')).toBe(false);
    }
  });

  it('rejeita question acima do limite de tamanho', () => {
    const result = analysisInputSchema.safeParse({ ...validInput, question: 'a'.repeat(5000) });
    expect(result.success).toBe(false);
  });

  it.each([
    ['user_id', 'algum-uuid'],
    ['email', 'x@x.com'],
    ['quota', 5],
    ['quota_date', '2026-01-01'],
    ['analysis_id', 'algum-uuid'],
    ['model', 'gemini-2.5-flash'],
    ['error_type', 'KNOWLEDGE_GAP'],
    ['card_action', 'CREATE_BASIC_CARD'],
    ['confidence', 0.9],
    ['role', 'admin'],
    ['created_at', '2026-01-01T00:00:00Z'],
  ])('rejeita payload contendo o campo proibido "%s"', (field, value) => {
    const result = analysisInputSchema.safeParse({ ...validInput, [field]: value });
    expect(result.success).toBe(false);
  });
});

describe('analysisOutputSchema', () => {
  const base = {
    probableErrorType: 'CONCEPT_CONFUSION' as const,
    confidence: 0.85,
    reasoningSummary: 'Você confundiu dois conceitos próximos entre si.',
    coreConcept: 'Diferença entre X e Y',
  };

  it('aceita NO_CARD com card = null', () => {
    const result = analysisOutputSchema.safeParse({ ...base, cardAction: 'NO_CARD', card: null });
    expect(result.success).toBe(true);
  });

  it('rejeita NO_CARD com card preenchido', () => {
    const result = analysisOutputSchema.safeParse({
      ...base,
      cardAction: 'NO_CARD',
      card: { front: 'x', back: 'y' },
    });
    expect(result.success).toBe(false);
  });

  it.each([
    'CREATE_BASIC_CARD',
    'CREATE_DISCRIMINATION_CARD',
    'CREATE_EXCEPTION_CARD',
    'CREATE_APPLICATION_CARD',
  ] as const)('aceita %s com card preenchido', (cardAction) => {
    const result = analysisOutputSchema.safeParse({
      ...base,
      cardAction,
      card: { front: 'Pergunta objetiva?', back: 'Resposta objetiva.' },
    });
    expect(result.success).toBe(true);
  });

  it.each([
    'CREATE_BASIC_CARD',
    'CREATE_DISCRIMINATION_CARD',
    'CREATE_EXCEPTION_CARD',
    'CREATE_APPLICATION_CARD',
  ] as const)('rejeita %s com card = null', (cardAction) => {
    const result = analysisOutputSchema.safeParse({ ...base, cardAction, card: null });
    expect(result.success).toBe(false);
  });

  it('rejeita probableErrorType fora da taxonomia', () => {
    const result = analysisOutputSchema.safeParse({
      ...base,
      probableErrorType: 'RANDOM_TYPE',
      cardAction: 'NO_CARD',
      card: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejeita cardAction fora do conjunto permitido', () => {
    const result = analysisOutputSchema.safeParse({ ...base, cardAction: 'GENERATE_ANYTHING', card: null });
    expect(result.success).toBe(false);
  });

  it.each([-0.1, 1.1, 2, -5])('rejeita confidence fora do intervalo 0.0-1.0 (%s)', (confidence) => {
    const result = analysisOutputSchema.safeParse({ ...base, confidence, cardAction: 'NO_CARD', card: null });
    expect(result.success).toBe(false);
  });

  it.each([0, 0.5, 1])('aceita confidence nos limites do intervalo (%s)', (confidence) => {
    const result = analysisOutputSchema.safeParse({ ...base, confidence, cardAction: 'NO_CARD', card: null });
    expect(result.success).toBe(true);
  });
});

describe('idempotencyKeySchema', () => {
  it('aceita um UUID v4 válido', () => {
    expect(idempotencyKeySchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });

  it.each([null, undefined, '', 'not-a-uuid', '12345', 'a'.repeat(36)])(
    'rejeita valor inválido de Idempotency-Key: %s',
    (value) => {
      expect(idempotencyKeySchema.safeParse(value).success).toBe(false);
    }
  );
});

describe('applyLowConfidencePolicy', () => {
  const withCard: AnalysisOutput = {
    probableErrorType: 'KNOWLEDGE_GAP',
    confidence: 0.3,
    reasoningSummary: 'Resumo curto e útil.',
    coreConcept: 'Conceito X',
    cardAction: 'CREATE_BASIC_CARD',
    card: { front: 'Pergunta?', back: 'Resposta.' },
  };

  it(`rebaixa para NO_CARD quando confidence < ${LOW_CONFIDENCE_THRESHOLD}`, () => {
    const result = applyLowConfidencePolicy(withCard);
    expect(result.cardAction).toBe('NO_CARD');
    expect(result.card).toBeNull();
  });

  it('preserva a classificação de causa provável ao rebaixar (não força INSUFFICIENT_INFORMATION)', () => {
    const result = applyLowConfidencePolicy(withCard);
    expect(result.probableErrorType).toBe('KNOWLEDGE_GAP');
  });

  it('não altera saída quando confidence >= threshold', () => {
    const highConfidence: AnalysisOutput = { ...withCard, confidence: 0.9 };
    const result = applyLowConfidencePolicy(highConfidence);
    expect(result).toEqual(highConfidence);
  });

  it('não altera NO_CARD já existente mesmo com confidence baixa', () => {
    const noCard: AnalysisOutput = {
      probableErrorType: 'INSUFFICIENT_INFORMATION',
      confidence: 0.2,
      reasoningSummary: 'Dados insuficientes para conclusão segura.',
      coreConcept: 'N/A',
      cardAction: 'NO_CARD',
      card: null,
    };
    const result = applyLowConfidencePolicy(noCard);
    expect(result).toEqual(noCard);
  });
});
