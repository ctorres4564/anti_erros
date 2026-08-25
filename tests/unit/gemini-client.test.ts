import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIAnalysisError, GeminiAnalysisClient } from '@/lib/ai/gemini';
import type { AnalysisInput } from '@/lib/ai/analysis-schema';

const input: AnalysisInput = {
  question: 'Qual é a capital da França?',
  userAnswer: 'Lyon',
  correctAnswer: 'Paris',
};

function mockFetchOnce(response: Partial<Response> & { jsonBody?: unknown; textBody?: string }) {
  return vi.fn().mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody,
    text: async () => response.textBody ?? '',
  } as Response);
}

function geminiPayload(candidateText: string) {
  return {
    candidates: [{ content: { parts: [{ text: candidateText }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 },
  };
}

describe('GeminiAnalysisClient', () => {
  const validOutputJson = JSON.stringify({
    discipline: 'Direito Administrativo',
    probableErrorType: 'CONCEPT_CONFUSION',
    confidence: 0.9,
    reasoningSummary: 'Você confundiu dois conceitos próximos.',
    recommendedAction: 'Revise a distinção entre os institutos e resolva 3 questões.',
    coreConcept: 'X vs Y',
    cardAction: 'CREATE_DISCRIMINATION_CARD',
    card: { front: 'Qual a diferença entre X e Y?', back: 'X é..., Y é...' },
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna output validado em uma chamada bem-sucedida com schema válido', async () => {
    const fetchMock = mockFetchOnce({ jsonBody: geminiPayload(validOutputJson) });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key', model: 'gemini-test' });
    const result = await client.analyze(input);

    expect(result.output.cardAction).toBe('CREATE_DISCRIMINATION_CARD');
    expect(result.output.discipline).toBe('Direito Administrativo');
    expect(result.output.recommendedAction).toBe('Revise a distinção entre os institutos e resolva 3 questões.');
    expect(result.modelVersion).toBe('gemini-test');
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(40);
    expect(result.usage.retries).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propaga AIAnalysisError com código HTTP_ERROR em resposta HTTP não-ok', async () => {
    const fetchMock = mockFetchOnce({ ok: false, status: 500, textBody: 'internal error' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key' });
    await expect(client.analyze(input)).rejects.toMatchObject({ code: 'HTTP_ERROR' } satisfies Partial<AIAnalysisError>);
  });

  it('propaga AIAnalysisError com código EMPTY_RESPONSE quando não há texto', async () => {
    const fetchMock = mockFetchOnce({ jsonBody: { candidates: [] } });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key' });
    await expect(client.analyze(input)).rejects.toMatchObject({ code: 'EMPTY_RESPONSE' });
  });

  it('faz exatamente 1 retry quando o schema é inválido na primeira tentativa, e sucede na segunda', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => geminiPayload('{"not":"the expected shape"}'),
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => geminiPayload(validOutputJson),
        text: async () => '',
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key', maxSchemaRetries: 1 });
    const result = await client.analyze(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.usage.retries).toBe(1);
    expect(result.output.cardAction).toBe('CREATE_DISCRIMINATION_CARD');
  });

  it('falha com SCHEMA_INVALID após esgotar o número máximo de retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => geminiPayload('{"not":"the expected shape"}'),
      text: async () => '',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key', maxSchemaRetries: 1 });
    await expect(client.analyze(input)).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('não faz retry para erros que não sejam de schema (ex.: HTTP_ERROR)', async () => {
    const fetchMock = mockFetchOnce({ ok: false, status: 503, textBody: 'unavailable' });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key', maxSchemaRetries: 1 });
    await expect(client.analyze(input)).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propaga AIAnalysisError com código TIMEOUT quando a chamada excede o timeout configurado', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new GeminiAnalysisClient({ apiKey: 'test-key', timeoutMs: 20 });
    await expect(client.analyze(input)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejeita construção sem apiKey', () => {
    expect(() => new GeminiAnalysisClient({ apiKey: '' })).toThrow();
  });
});
