import { describe, expect, it } from 'vitest';
import { GeminiAnalysisClient } from '@/lib/ai/gemini';
import { AI_MODEL } from '@/config/ai';

/**
 * Smoke tests reais do Gemini (seção 63 da Sprint 3): autenticação, model ID,
 * structured output, latência e parsing — antes do benchmark de 90 casos.
 * Só roda com GEMINI_API_KEY real configurada; nunca simula resultado.
 * Pode falhar legitimamente por indisponibilidade/cota externa do provedor —
 * isso é reportado como está, nunca mascarado.
 */

const apiKey = process.env.GEMINI_API_KEY;
const available = Boolean(apiKey) && apiKey !== 'your-gemini-api-key-here' && !apiKey?.startsWith('disabled');

if (!available) {
  console.warn('[integration] GEMINI_API_KEY ausente/placeholder — smoke tests reais do Gemini pulados.');
}

describe.skipIf(!available)('Sprint 3: smoke test real do Gemini', () => {
  it('autentica, usa o model ID configurado e retorna structured output válido', async () => {
    const client = new GeminiAnalysisClient({ apiKey: apiKey as string, model: AI_MODEL });

    const startedAt = Date.now();
    const result = await client.analyze({
      question: 'Qual é a capital da França?',
      userAnswer: 'Lyon',
      correctAnswer: 'Paris',
    });
    const latencyMs = Date.now() - startedAt;

    expect(result.modelVersion).toBe(AI_MODEL);
    expect(latencyMs).toBeLessThan(60000);
    expect([
      'KNOWLEDGE_GAP',
      'CONCEPT_CONFUSION',
      'EXCEPTION_MISSED',
      'APPLICATION_ERROR',
      'READING_ERROR',
      'INSUFFICIENT_INFORMATION',
    ]).toContain(result.output.probableErrorType);
    expect(result.output.confidence).toBeGreaterThanOrEqual(0);
    expect(result.output.confidence).toBeLessThanOrEqual(1);
    expect(result.usage.inputTokens).toBeGreaterThan(0);

    if (result.output.cardAction === 'NO_CARD') {
      expect(result.output.card).toBeNull();
    } else {
      expect(result.output.card).not.toBeNull();
    }

    // Nunca deve conter conteúdo de chain-of-thought explícito nem vazar a chave.
    expect(result.output.reasoningSummary).not.toContain(apiKey);
  }, 60000);
});
