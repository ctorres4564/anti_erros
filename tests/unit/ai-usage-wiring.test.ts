import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeminiCallTelemetry } from '@/lib/ai/usage';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  generateSimpleExplanation: vi.fn(),
  recordAuthenticatedAiUsage: vi.fn(),
  recordAnonymousAiUsage: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })),
}));

vi.mock('@/lib/ai/simple-explanation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/simple-explanation')>()),
  generateSimpleExplanation: mocks.generateSimpleExplanation,
}));

vi.mock('@/services/ai-usage', () => ({
  AI_USAGE_EVENT_NAME: 'ai_usage_recorded',
  recordAuthenticatedAiUsage: mocks.recordAuthenticatedAiUsage,
  recordAnonymousAiUsage: mocks.recordAnonymousAiUsage,
}));

import { POST } from '@/app/api/analyses/explain-simple/route';
import { SimpleExplanationError } from '@/lib/ai/simple-explanation';

const payload = {
  question: 'Qual é o maior planeta do Sistema Solar?',
  userAnswer: 'Saturno',
  correctAnswer: 'Júpiter',
  concept: 'Tamanho dos planetas',
};

const telemetry: GeminiCallTelemetry = {
  feature: 'simple_explanation',
  requestedModel: 'gemini-3.6-flash',
  servedModel: 'gemini-3.6-flash',
  usage: { promptTokenCount: 50, candidatesTokenCount: 80, thoughtsTokenCount: 120, totalTokenCount: 250 },
  latencyMs: 900,
  attempt: 1,
  isRetry: false,
  outcome: 'SUCCESS',
};

function request(userId: string) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  return new NextRequest('http://localhost/api/analyses/explain-simple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

describe('/api/analyses/explain-simple registra consumo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAuthenticatedAiUsage.mockResolvedValue(undefined);
    mocks.generateSimpleExplanation.mockImplementation(async (_input, options) => {
      options?.onGeminiCall?.(telemetry);
      return 'Explicação simples.';
    });
  });

  it('sucesso grava o consumo associado ao usuário autenticado', async () => {
    const response = await POST(request('user-usage-1'));

    expect(response.status).toBe(200);
    expect(mocks.recordAuthenticatedAiUsage).toHaveBeenCalledWith('user-usage-1', telemetry);
    expect(mocks.recordAnonymousAiUsage).not.toHaveBeenCalled();
  });

  it('falha da IA ainda registra a chamada (custo sem sucesso)', async () => {
    mocks.generateSimpleExplanation.mockImplementation(async (_input, options) => {
      options?.onGeminiCall?.({ ...telemetry, outcome: 'TIMEOUT', usage: undefined });
      throw new SimpleExplanationError('TIMEOUT', 'timeout');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await POST(request('user-usage-2'));

    expect(response.status).toBe(503);
    expect(mocks.recordAuthenticatedAiUsage).toHaveBeenCalledOnce();
    expect(mocks.recordAuthenticatedAiUsage.mock.calls[0][1]).toMatchObject({
      outcome: 'TIMEOUT',
      usage: undefined,
    });
    warnSpy.mockRestore();
  });

  it('falha ao gravar telemetria NÃO derruba a explicação', async () => {
    mocks.recordAuthenticatedAiUsage.mockRejectedValue(new Error('events fora do ar'));

    // O serviço real engole o erro; aqui simulamos o pior caso (rejeição) para
    // garantir que a rota continue entregando a explicação mesmo assim.
    const response = await POST(request('user-usage-3'));

    expect(response.status).toBe(200);
    expect((await response.json()).explanation).toBe('Explicação simples.');
  });

  it('rate limit excedido não gera registro de consumo (não houve chamada ao Gemini)', async () => {
    for (let i = 0; i < 10; i++) await POST(request('user-usage-rate'));
    mocks.recordAuthenticatedAiUsage.mockClear();

    const blocked = await POST(request('user-usage-rate'));

    expect(blocked.status).toBe(429);
    expect(mocks.recordAuthenticatedAiUsage).not.toHaveBeenCalled();
  });
});
