import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/analyses/preview/route';
import { createAnonymousPendingAnalysis } from '@/services/pending-analysis';

vi.mock('@/lib/ai/resolve-client', () => ({
  resolveAIClient: vi.fn(() => ({ analyze: vi.fn() })),
}));

vi.mock('@/lib/security/claim-token', () => ({
  generateAnonymousId: vi.fn(() => 'anonymous-review-id'),
}));

vi.mock('@/services/pending-analysis', () => ({
  createAnonymousPendingAnalysis: vi.fn(),
}));

const claimToken = 'a'.repeat(64);

describe('POST /api/analyses/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAnonymousPendingAnalysis).mockResolvedValue({
      kind: 'SUCCESS',
      preview: {
        anonymousId: 'anonymous-review-id',
        claimToken,
        probableErrorType: 'KNOWLEDGE_GAP',
        concept: 'Capital federal',
        discipline: 'Atualidades',
        divergenceMessage: 'As classificações foram comparadas de forma independente.',
        isAligned: true,
        aiUserAgreement: true,
      },
    });
  });

  it('retorna somente o preview público e transporta o claim token em cookie HttpOnly', async () => {
    const request = new NextRequest('http://localhost/api/analyses/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Qual é a capital do Brasil?',
        userAnswer: 'Rio de Janeiro',
        correctAnswer: 'Brasília',
        studentReasoning: 'Associei a capital à cidade mais conhecida.',
        userAttribution: 'NAO_SABIA_CONTEUDO',
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const setCookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      preview: {
        probableErrorType: 'KNOWLEDGE_GAP',
        concept: 'Capital federal',
        discipline: 'Atualidades',
        divergenceMessage: 'As classificações foram comparadas de forma independente.',
        isAligned: true,
      },
    });
    expect(payload).not.toHaveProperty('claimToken');
    expect(response.cookies.get('claim_token')?.value).toBe(claimToken);
    expect(setCookie).toContain(`claim_token=${claimToken}`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=lax');
    expect(setCookie.toLowerCase()).toContain('max-age=86400');
    expect(createAnonymousPendingAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        studentReasoning: 'Associei a capital à cidade mais conhecida.',
        userAttribution: 'NAO_SABIA_CONTEUDO',
      }),
    }));
  });
});
