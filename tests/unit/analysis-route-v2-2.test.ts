import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/analyses/route';
import { runAnalysisEngine } from '@/services/analysis';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-v2-2' } }, error: null })) },
  })),
}));

vi.mock('@/services/onboarding', () => ({
  isOnboardingComplete: vi.fn(async () => true),
}));

vi.mock('@/lib/ai/resolve-client', () => ({
  resolveAIClient: vi.fn(() => ({ analyze: vi.fn() })),
}));

vi.mock('@/services/analysis', () => ({
  runAnalysisEngine: vi.fn(),
}));

const idempotencyKey = '11111111-1111-4111-8111-111111111111';

function requestWith(body: unknown) {
  return new NextRequest('http://localhost/api/analyses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analyses — contrato analysis-v2.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAnalysisEngine).mockResolvedValue({ kind: 'PENDING' });
  });

  it('envia studentReasoning à engine e mantém userAttribution separado', async () => {
    const response = await POST(requestWith({
      question: 'Um produto de R$ 200 recebe desconto de 20% e depois aumento de 20%.',
      userAnswer: 'R$ 200',
      correctAnswer: 'R$ 192',
      studentReasoning: 'Pensei que os dois percentuais se anulavam.',
      userAttribution: 'ERRO_APLICACAO',
    }));

    expect(response.status).toBe(409);
    expect(runAnalysisEngine).toHaveBeenCalledWith(expect.objectContaining({
      input: {
        question: 'Um produto de R$ 200 recebe desconto de 20% e depois aumento de 20%.',
        userAnswer: 'R$ 200',
        correctAnswer: 'R$ 192',
        studentReasoning: 'Pensei que os dois percentuais se anulavam.',
      },
      userAttribution: 'ERRO_APLICACAO',
    }));
    expect(vi.mocked(runAnalysisEngine).mock.calls[0][0].input).not.toHaveProperty('userAttribution');
    expect(vi.mocked(runAnalysisEngine).mock.calls[0][0].input).not.toHaveProperty('officialExplanation');
  });

  it('rejeita officialExplanation no contrato público v2.2', async () => {
    const response = await POST(requestWith({
      question: 'Qual é a capital da França?',
      userAnswer: 'Lyon',
      correctAnswer: 'Paris',
      officialExplanation: 'Campo histórico não aceito no contrato ativo.',
      userAttribution: 'NAO_SABIA_CONTEUDO',
    }));

    expect(response.status).toBe(400);
    expect(runAnalysisEngine).not.toHaveBeenCalled();
  });
});
