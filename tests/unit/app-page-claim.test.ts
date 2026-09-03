import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaimReference } from '@/lib/security/claim-token';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isOnboardingComplete: vi.fn(),
  getUserProfileData: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  })),
}));

vi.mock('@/services/onboarding', () => ({
  isOnboardingComplete: mocks.isOnboardingComplete,
  getUserProfileData: mocks.getUserProfileData,
}));

import AppPage from '@/app/app/page';

const VALID_REFERENCE = createClaimReference(
  '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
  'a'.repeat(64)
);

describe('/app e repasse estrutural do claim_ref (sem gate de cookie no server component)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'u@example.com' } }, error: null });
    mocks.isOnboardingComplete.mockResolvedValue(true);
    mocks.getUserProfileData.mockResolvedValue({ fullName: 'Usuário' });
  });

  it('D) sem claim_ref, mantém o fluxo autenticado normal', async () => {
    const result = await AppPage({ searchParams: Promise.resolve({}) });

    expect(result.props.claimReference).toBeNull();
    expect(result.props.initialHistory).toEqual([]);
  });

  it('A) repassa claim_ref estruturalmente válido ao componente cliente, mesmo sem checar cookie aqui', async () => {
    const result = await AppPage({
      searchParams: Promise.resolve({ claim_ref: VALID_REFERENCE }),
    });

    // A validação de segurança real (cookie + assinatura) é feita por
    // /api/pending-analyses/claim, não por este Server Component.
    expect(result.props.claimReference).toBe(VALID_REFERENCE);
  });

  it('C) claim_ref malformado nunca é repassado (comportamento seguro)', async () => {
    const result = await AppPage({
      searchParams: Promise.resolve({ claim_ref: 'referencia-sem-formato-valido' }),
    });

    expect(result.props.claimReference).toBeNull();
  });
});
