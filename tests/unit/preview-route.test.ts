import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/analyses/preview/route';

const mocks = vi.hoisted(() => ({ createAnonymousPendingAnalysis: vi.fn() }));

vi.mock('@/services/pending-analysis', () => ({
  createAnonymousPendingAnalysis: mocks.createAnonymousPendingAnalysis,
}));

describe('POST /api/analyses/preview', () => {
  it('rejeita novas análises anônimas sem processar conteúdo nem criar cookies', async () => {
    const request = new NextRequest('http://localhost/api/analyses/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Questão que não deve ser processada',
        userAnswer: 'Resposta',
        correctAnswer: 'Gabarito',
      }),
    });

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(410);
    expect(payload).toEqual({
      error: 'ANONYMOUS_ANALYSIS_DISCONTINUED',
      message: 'A análise de questões próprias agora exige autenticação.',
    });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.createAnonymousPendingAnalysis).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });
});
