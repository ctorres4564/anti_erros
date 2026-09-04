import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractUsageMetadata,
  toUsageEventProperties,
  type GeminiCallTelemetry,
} from '@/lib/ai/usage';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mocks.from })),
}));

import {
  AI_USAGE_EVENT_NAME,
  recordAuthenticatedAiUsage,
  recordAnonymousAiUsage,
} from '@/services/ai-usage';

/** usageMetadata real capturado do gemini-3.6-flash (sonda controlada). */
const REAL_USAGE = {
  promptTokenCount: 13,
  candidatesTokenCount: 1,
  totalTokenCount: 180,
  promptTokensDetails: [{ modality: 'TEXT', tokenCount: 13 }],
  thoughtsTokenCount: 166,
  serviceTier: 'standard',
};

const telemetry: GeminiCallTelemetry = {
  feature: 'analysis',
  requestedModel: 'gemini-3.6-flash',
  servedModel: 'gemini-3.6-flash',
  usage: extractUsageMetadata(REAL_USAGE),
  latencyMs: 1200,
  attempt: 1,
  isRetry: false,
  outcome: 'SUCCESS',
};

describe('extractUsageMetadata: ausência nunca vira zero', () => {
  it('preserva os campos reais do modelo em produção, incluindo thoughts e total', () => {
    const usage = extractUsageMetadata(REAL_USAGE);

    expect(usage?.promptTokenCount).toBe(13);
    expect(usage?.candidatesTokenCount).toBe(1);
    expect(usage?.thoughtsTokenCount).toBe(166);
    expect(usage?.totalTokenCount).toBe(180);
    expect(usage?.serviceTier).toBe('standard');
    expect(usage?.promptTokensDetails).toEqual([{ modality: 'TEXT', tokenCount: 13 }]);
  });

  it('campos não retornados permanecem AUSENTES (não viram 0 nem null)', () => {
    const usage = extractUsageMetadata(REAL_USAGE)!;

    for (const absent of [
      'cachedContentTokenCount',
      'toolUsePromptTokenCount',
      'candidatesTokensDetails',
      'cacheTokensDetails',
      'toolUsePromptTokensDetails',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(usage, absent)).toBe(false);
      expect(usage[absent as keyof typeof usage]).toBeUndefined();
    }
  });

  it('descarta campos desconhecidos e conteúdo textual do payload', () => {
    const usage = extractUsageMetadata({
      promptTokenCount: 10,
      candidates: [{ content: { parts: [{ text: 'texto gerado' }] } }],
      question: 'Qual é o maior planeta?',
    });

    expect(usage).toEqual({ promptTokenCount: 10 });
    expect(JSON.stringify(usage)).not.toContain('planeta');
    expect(JSON.stringify(usage)).not.toContain('texto gerado');
  });

  it('devolve undefined quando não há usage utilizável', () => {
    expect(extractUsageMetadata(undefined)).toBeUndefined();
    expect(extractUsageMetadata(null)).toBeUndefined();
    expect(extractUsageMetadata({})).toBeUndefined();
    expect(extractUsageMetadata({ promptTokenCount: 'muitos' })).toBeUndefined();
  });
});

describe('toUsageEventProperties: só metadados técnicos', () => {
  it('achata a telemetria mantendo apenas chaves permitidas', () => {
    const properties = toUsageEventProperties(telemetry);

    expect(properties).toEqual({
      feature: 'analysis',
      requestedModel: 'gemini-3.6-flash',
      servedModel: 'gemini-3.6-flash',
      latencyMs: 1200,
      attempt: 1,
      isRetry: false,
      outcome: 'SUCCESS',
      promptTokenCount: 13,
      candidatesTokenCount: 1,
      thoughtsTokenCount: 166,
      totalTokenCount: 180,
      serviceTier: 'standard',
      promptTokensDetails: [{ modality: 'TEXT', tokenCount: 13 }],
    });
  });

  it('evento de erro sem usage não inventa contagens', () => {
    const properties = toUsageEventProperties({
      feature: 'analysis',
      requestedModel: 'gemini-3.6-flash',
      latencyMs: 45_000,
      attempt: 1,
      isRetry: false,
      outcome: 'TIMEOUT',
    });

    expect(properties.outcome).toBe('TIMEOUT');
    expect(Object.keys(properties)).not.toContain('promptTokenCount');
    expect(Object.keys(properties)).not.toContain('totalTokenCount');
    expect(Object.keys(properties)).not.toContain('servedModel');
  });

  it('nenhuma chave sensível ou pedagógica pode aparecer nas properties', () => {
    const keys = Object.keys(toUsageEventProperties(telemetry));
    const forbidden = [
      'question',
      'raw_question',
      'userAnswer',
      'correctAnswer',
      'studentReasoning',
      'reasoning',
      'explanation',
      'prompt',
      'email',
      'claim_ref',
      'claimReference',
      'token',
      'apiKey',
    ];

    for (const key of forbidden) {
      expect(keys).not.toContain(key);
    }
  });
});

describe('persistência best-effort do consumo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it('uso autenticado vai para public.events com user_id', async () => {
    await recordAuthenticatedAiUsage('user-1', telemetry);

    expect(mocks.from).toHaveBeenCalledWith('events');
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      event_name: AI_USAGE_EVENT_NAME,
      properties: toUsageEventProperties(telemetry),
    });
  });

  it('uso anônimo vai para public.anonymous_events com anonymous_id e pending_analysis_id', async () => {
    await recordAnonymousAiUsage('anon_123', 'pending-uuid', {
      ...telemetry,
      feature: 'analysis',
    });

    expect(mocks.from).toHaveBeenCalledWith('anonymous_events');
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymous_id: 'anon_123',
        event_name: AI_USAGE_EVENT_NAME,
        pending_analysis_id: 'pending-uuid',
      })
    );
  });

  it('falha antes da pending existir grava pending_analysis_id null', async () => {
    await recordAnonymousAiUsage('anon_123', null, {
      ...telemetry,
      outcome: 'HTTP_ERROR',
      usage: undefined,
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ pending_analysis_id: null })
    );
  });

  it('erro do banco não propaga e é logado sem conteúdo do usuário', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'db indisponível' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(recordAuthenticatedAiUsage('user-1', telemetry)).resolves.toBeUndefined();

    const logged = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(logged).toContain('analysis');
    expect(logged).not.toContain('planeta');
    warnSpy.mockRestore();
  });

  it('exceção inesperada do client também é engolida', async () => {
    mocks.from.mockImplementation(() => {
      throw new Error('conexão caiu');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(recordAnonymousAiUsage('anon_1', null, telemetry)).resolves.toBeUndefined();

    warnSpy.mockRestore();
  });
});
