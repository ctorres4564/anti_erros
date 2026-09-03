import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClaimReference,
  getClaimCookieName,
} from '@/lib/security/claim-token';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isOnboardingComplete: vi.fn(),
  claimPendingAnalysisForUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock('@/services/onboarding', () => ({
  isOnboardingComplete: mocks.isOnboardingComplete,
}));

vi.mock('@/services/pending-analysis', () => ({
  claimPendingAnalysisForUser: mocks.claimPendingAnalysisForUser,
}));

import { POST } from '@/app/api/pending-analyses/claim/route';

const PENDING_A = '6607bfb7-cf9a-40d3-a406-a50291dc4f22';
const PENDING_B = '550e8400-e29b-41d4-a716-446655440000';
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const REFERENCE_A = createClaimReference(PENDING_A, TOKEN_A);
const REFERENCE_B = createClaimReference(PENDING_B, TOKEN_B);

const analysis = {
  id: '9f418171-3f8c-47c0-9f31-17c763efdca1',
  question: 'Questão A',
  userAnswer: 'A',
  correctAnswer: 'B',
  studentReasoning: null,
  discipline: 'Outra',
  probableErrorType: 'INSUFFICIENT_INFORMATION',
  confidence: 0.4,
  reasoningSummary: 'Informações insuficientes para classificar com segurança.',
  recommendedAction: 'Revise a resolução e registre o raciocínio utilizado.',
  coreConcept: 'Conceito A',
  cardAction: 'NO_CARD',
  card: null,
  createdAt: '2026-09-02T12:00:00.000Z',
};

function request(reference: string, cookies: Record<string, string>) {
  const cookie = Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
  return new NextRequest('http://localhost/api/pending-analyses/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ claimReference: reference }),
  });
}

describe('POST /api/pending-analyses/claim com vínculo explícito', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.isOnboardingComplete.mockResolvedValue(true);
    mocks.claimPendingAnalysisForUser.mockResolvedValue({ kind: 'SUCCESS', analysis });
  });

  it('preview A → login → claim A', async () => {
    const response = await POST(request(REFERENCE_A, {
      [getClaimCookieName(PENDING_A)]: TOKEN_A,
    }));

    expect(response.status).toBe(200);
    expect(mocks.claimPendingAnalysisForUser).toHaveBeenCalledWith({
      userId: 'user-1', claimToken: TOKEN_A, pendingAnalysisId: PENDING_A,
    });
  });

  it('com A e B na mesma sessão, a referência visível de A reclama A', async () => {
    const bothCookies = {
      [getClaimCookieName(PENDING_A)]: TOKEN_A,
      [getClaimCookieName(PENDING_B)]: TOKEN_B,
    };

    await POST(request(REFERENCE_A, bothCookies));
    expect(mocks.claimPendingAnalysisForUser).toHaveBeenLastCalledWith(
      expect.objectContaining({ claimToken: TOKEN_A, pendingAnalysisId: PENDING_A })
    );

    await POST(request(REFERENCE_B, bothCookies));
    expect(mocks.claimPendingAnalysisForUser).toHaveBeenLastCalledWith(
      expect.objectContaining({ claimToken: TOKEN_B, pendingAnalysisId: PENDING_B })
    );
  });

  it('B) referência estruturalmente válida sem cookie correspondente falha com erro claro, sem executar claim', async () => {
    const response = await POST(request(REFERENCE_A, {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeTruthy();
    expect(mocks.claimPendingAnalysisForUser).not.toHaveBeenCalled();
  });

  it('rejeita referência adulterada sem executar claim', async () => {
    const tampered = `${REFERENCE_A.slice(0, -1)}x`;
    const response = await POST(request(tampered, {
      [getClaimCookieName(PENDING_A)]: TOKEN_A,
    }));

    expect(response.status).toBe(400);
    expect(mocks.claimPendingAnalysisForUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: 'NOT_FOUND', message: 'Análise pendente não encontrada.' }, 404],
    [{ kind: 'EXPIRED', message: 'Esta análise expirou.' }, 410],
  ] as const)('falha de forma segura para pending inexistente/expirado', async (result, status) => {
    mocks.claimPendingAnalysisForUser.mockResolvedValue(result);
    const response = await POST(request(REFERENCE_A, {
      [getClaimCookieName(PENDING_A)]: TOKEN_A,
    }));

    expect(response.status).toBe(status);
    expect((await response.json()).error).toBe(result.message);
  });
});
