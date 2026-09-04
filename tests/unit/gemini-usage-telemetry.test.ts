import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiAnalysisClient } from '@/lib/ai/gemini';
import type { AnalysisInput } from '@/lib/ai/analysis-schema';
import type { GeminiCallTelemetry } from '@/lib/ai/usage';

const input: AnalysisInput = {
  question: 'Qual é o maior planeta do Sistema Solar?',
  userAnswer: 'Saturno',
  correctAnswer: 'Júpiter',
  studentReasoning: 'Lembrei dos anéis.',
};

const validOutput = JSON.stringify({
  discipline: 'Outra',
  probableErrorType: 'CONCEPT_CONFUSION',
  confidence: 0.9,
  reasoningSummary: 'Confundiu tamanho aparente com tamanho real.',
  recommendedAction: 'Compare os diâmetros dos planetas.',
  coreConcept: 'Tamanho planetário',
  cardAction: 'CREATE_DISCRIMINATION_CARD',
  card: { front: 'Maior planeta?', back: 'Júpiter.' },
});

/** usageMetadata real do gemini-3.6-flash (capturado na sonda controlada). */
const REAL_USAGE = {
  promptTokenCount: 13,
  candidatesTokenCount: 1,
  totalTokenCount: 180,
  promptTokensDetails: [{ modality: 'TEXT', tokenCount: 13 }],
  thoughtsTokenCount: 166,
  serviceTier: 'standard',
};

function geminiOk(text: string, usage: unknown = REAL_USAGE) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: usage,
      modelVersion: 'gemini-3.6-flash',
    }),
    text: async () => '',
  } as Response;
}

describe('telemetria por chamada real ao Gemini (análise principal)', () => {
  let calls: GeminiCallTelemetry[];
  let client: GeminiAnalysisClient;

  beforeEach(() => {
    calls = [];
    client = new GeminiAnalysisClient({ apiKey: 'k', model: 'gemini-3.6-flash' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const hooks = () => ({ onGeminiCall: (t: GeminiCallTelemetry) => calls.push(t) });

  it('sucesso gera UM evento com thoughts, total e modelo servido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(validOutput)));

    await client.analyze(input, hooks());

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      feature: 'analysis',
      requestedModel: 'gemini-3.6-flash',
      servedModel: 'gemini-3.6-flash',
      attempt: 1,
      isRetry: false,
      outcome: 'SUCCESS',
    });
    expect(calls[0].usage?.thoughtsTokenCount).toBe(166);
    expect(calls[0].usage?.totalTokenCount).toBe(180);
    expect(calls[0].usage?.candidatesTokenCount).toBe(1);
    expect(typeof calls[0].latencyMs).toBe('number');
  });

  it('retry de schema gera DOIS eventos, identificando attempt e isRetry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiOk('{"invalido":true}'))
      .mockResolvedValueOnce(geminiOk(validOutput));
    vi.stubGlobal('fetch', fetchMock);

    await client.analyze(input, hooks());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);

    expect(calls[0]).toMatchObject({ attempt: 1, isRetry: false, outcome: 'SCHEMA_INVALID' });
    // A chamada com schema inválido FOI cobrada: o usage precisa estar presente.
    expect(calls[0].usage?.totalTokenCount).toBe(180);

    expect(calls[1]).toMatchObject({ attempt: 2, isRetry: true, outcome: 'SUCCESS' });
  });

  it('erro HTTP gera evento sem usage, sem inventar zeros', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'erro' } as Response)
    );

    await expect(client.analyze(input, hooks())).rejects.toMatchObject({ code: 'HTTP_ERROR' });

    expect(calls).toHaveLength(1);
    expect(calls[0].outcome).toBe('HTTP_ERROR');
    expect(calls[0].usage).toBeUndefined();
    expect(calls[0].servedModel).toBeUndefined();
    expect(calls[0].attempt).toBe(1);
  });

  it('timeout gera evento de custo potencial sem contagem de tokens', async () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    await expect(client.analyze(input, hooks())).rejects.toMatchObject({ code: 'TIMEOUT' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ outcome: 'TIMEOUT', attempt: 1, isRetry: false });
    expect(calls[0].usage).toBeUndefined();
  });

  it('resposta sem usageMetadata não gera campos inventados', async () => {
    // Resposta sem o campo usageMetadata (não é o mesmo que zerado).
    const semUsage = {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: validOutput }] }, finishReason: 'STOP' }],
      }),
      text: async () => '',
    } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(semUsage));

    await client.analyze(input, hooks());

    expect(calls[0].outcome).toBe('SUCCESS');
    expect(calls[0].usage).toBeUndefined();
  });

  it('hook com defeito não derruba a análise', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(validOutput)));

    const result = await client.analyze(input, {
      onGeminiCall: () => {
        throw new Error('telemetria quebrada');
      },
    });

    expect(result.output.probableErrorType).toBe('CONCEPT_CONFUSION');
  });

  it('sem hook, o comportamento anterior é preservado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk(validOutput)));

    const result = await client.analyze(input);

    expect(result.modelVersion).toBe('gemini-3.6-flash');
    expect(result.usage.inputTokens).toBe(13);
    expect(result.usage.outputTokens).toBe(1);
  });
});
