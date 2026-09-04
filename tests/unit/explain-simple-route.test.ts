import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  generateSimpleExplanation: vi.fn(),
  runAnalysisEngine: vi.fn(),
  resolveAIClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}));

vi.mock('@/lib/ai/simple-explanation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/simple-explanation')>()),
  generateSimpleExplanation: mocks.generateSimpleExplanation,
}));

// Guardas de regressão: a rota nunca deve tocar no motor de análise.
vi.mock('@/services/analysis', () => ({ runAnalysisEngine: mocks.runAnalysisEngine }));
vi.mock('@/lib/ai/resolve-client', () => ({ resolveAIClient: mocks.resolveAIClient }));

import { POST } from '@/app/api/analyses/explain-simple/route';
import {
  SimpleExplanationError,
  SIMPLE_EXPLANATION_RATE_LIMIT_MAX,
} from '@/lib/ai/simple-explanation';

const payload = {
  question: 'Qual é o maior planeta do Sistema Solar?',
  userAnswer: 'Saturno',
  correctAnswer: 'Júpiter',
  concept: 'Tamanho dos planetas',
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/analyses/explain-simple', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyses/explain-simple', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.generateSimpleExplanation.mockResolvedValue(
      'Saturno parece enorme por causa dos anéis, mas os anéis não contam como corpo do planeta. Por isso, Júpiter é o maior.'
    );
  });

  it('devolve a explicação para usuário autenticado', async () => {
    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      explanation:
        'Saturno parece enorme por causa dos anéis, mas os anéis não contam como corpo do planeta. Por isso, Júpiter é o maior.',
    });
    expect(mocks.generateSimpleExplanation).toHaveBeenCalledOnce();
  });

  it('não executa o motor de análise nem produz nova classificação de erro', async () => {
    const response = await POST(request(payload));
    const body = await response.json();

    expect(mocks.runAnalysisEngine).not.toHaveBeenCalled();
    expect(mocks.resolveAIClient).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty('probableErrorType');
    expect(body).not.toHaveProperty('cardAction');
    expect(body).not.toHaveProperty('analysis');
    expect(Object.keys(body)).toEqual(['explanation']);
  });

  it('não lê nem escreve em nenhuma tabela do banco', async () => {
    await POST(request(payload));

    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('encaminha ao gerador apenas os campos necessários', async () => {
    await POST(request(payload));

    expect(Object.keys(mocks.generateSimpleExplanation.mock.calls[0][0]).sort()).toEqual([
      'concept',
      'correctAnswer',
      'question',
      'userAnswer',
    ]);
  });

  it('exige sessão autenticada', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(request(payload));

    expect(response.status).toBe(401);
    expect(mocks.generateSimpleExplanation).not.toHaveBeenCalled();
  });

  it('rejeita payload com campos não previstos, sem chamar a IA', async () => {
    const response = await POST(request({ ...payload, analysisId: 'x', probableErrorType: 'KNOWLEDGE_GAP' }));

    expect(response.status).toBe(400);
    expect(mocks.generateSimpleExplanation).not.toHaveBeenCalled();
  });

  describe('rate limit próprio, por usuário autenticado', () => {
    it('permite o uso normal: vários pedidos dentro do limite continuam funcionando', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-uso-normal' } }, error: null });

      for (let i = 0; i < SIMPLE_EXPLANATION_RATE_LIMIT_MAX; i++) {
        const response = await POST(request(payload));
        expect(response.status).toBe(200);
      }

      expect(mocks.generateSimpleExplanation).toHaveBeenCalledTimes(SIMPLE_EXPLANATION_RATE_LIMIT_MAX);
    });

    it('acima do limite responde 429 sem chamar o Gemini', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-acima-do-limite' } }, error: null });

      for (let i = 0; i < SIMPLE_EXPLANATION_RATE_LIMIT_MAX; i++) {
        await POST(request(payload));
      }
      mocks.generateSimpleExplanation.mockClear();

      const blocked = await POST(request(payload));

      expect(blocked.status).toBe(429);
      expect((await blocked.json()).error).toContain('muitas explicações');
      expect(mocks.generateSimpleExplanation).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    });

    it('o limite é por usuário: outro usuário não é afetado', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-que-estourou' } }, error: null });
      for (let i = 0; i <= SIMPLE_EXPLANATION_RATE_LIMIT_MAX; i++) {
        await POST(request(payload));
      }

      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-vizinho' } }, error: null });
      const response = await POST(request(payload));

      expect(response.status).toBe(200);
    });

    it('payload inválido não consome o limite nem chama o Gemini', async () => {
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-payload-invalido' } }, error: null });

      const invalid = await POST(request({ ...payload, analysisId: 'x' }));
      expect(invalid.status).toBe(400);

      const valid = await POST(request(payload));
      expect(valid.status).toBe(200);
    });
  });

  it('devolve mensagem amigável em falha da IA, sem vazar conteúdo da questão', async () => {
    mocks.generateSimpleExplanation.mockRejectedValue(
      new SimpleExplanationError('TIMEOUT', 'Timeout de 45000ms ao gerar a explicação.')
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await POST(request(payload));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('Não foi possível gerar a explicação agora. Tente novamente.');
    expect(JSON.stringify(body)).not.toContain('planeta');

    const loggedText = warnSpy.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(loggedText).not.toContain('planeta');
    expect(loggedText).not.toContain('Saturno');
    expect(loggedText).toContain('TIMEOUT');

    warnSpy.mockRestore();
  });
});
