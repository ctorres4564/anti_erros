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

  describe('instrumentação app_page_claim_state', () => {
    it('registra que recebeu um claim_ref válido, com o pendingAnalysisId e sem a referência completa', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await AppPage({ searchParams: Promise.resolve({ claim_ref: VALID_REFERENCE }) });

      const events = logSpy.mock.calls.map(([line]) => JSON.parse(line as string));
      const state = events.find((e) => e.event === 'app_page_claim_state');

      expect(state?.hasClaimRefParam).toBe(true);
      expect(state?.claimRefStructurallyValid).toBe(true);
      expect(state?.pendingAnalysisId).toBe('6607bfb7-cf9a-40d3-a406-a50291dc4f22');

      const allLoggedText = logSpy.mock.calls.map(([line]) => line).join('\n');
      expect(allLoggedText).not.toContain(VALID_REFERENCE);

      logSpy.mockRestore();
    });

    it('registra ausência de claim_ref, distinguindo "/app" sem parâmetro', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await AppPage({ searchParams: Promise.resolve({}) });

      const state = logSpy.mock.calls
        .map(([line]) => JSON.parse(line as string))
        .find((e) => e.event === 'app_page_claim_state');

      expect(state?.hasClaimRefParam).toBe(false);
      expect(state?.claimRefStructurallyValid).toBe(false);
      expect(state?.pendingAnalysisId).toBeNull();

      logSpy.mockRestore();
    });

    it('registra claim_ref presente porém estruturalmente inválido', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await AppPage({ searchParams: Promise.resolve({ claim_ref: 'referencia-sem-formato-valido' }) });

      const state = logSpy.mock.calls
        .map(([line]) => JSON.parse(line as string))
        .find((e) => e.event === 'app_page_claim_state');

      expect(state?.hasClaimRefParam).toBe(true);
      expect(state?.claimRefStructurallyValid).toBe(false);

      logSpy.mockRestore();
    });
  });
});
