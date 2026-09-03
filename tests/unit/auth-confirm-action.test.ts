import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  isOnboardingComplete: vi.fn(),
  recordActivationEvent: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { verifyOtp: mocks.verifyOtp } })),
}));

vi.mock('@/services/onboarding', () => ({
  isOnboardingComplete: mocks.isOnboardingComplete,
}));

vi.mock('@/services/activation', () => ({
  recordActivationEvent: mocks.recordActivationEvent,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import { redirect } from 'next/navigation';
import { confirmMagicLink } from '@/app/auth/confirm/actions';

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe('confirmMagicLink (Server Action disparada pelo clique explícito)', () => {
  const claimReference = `6607bfb7-cf9a-40d3-a406-a50291dc4f22.${'a'.repeat(43)}`;
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'internal-only' } },
      error: null,
    });
    mocks.isOnboardingComplete.mockResolvedValue(true);
    mocks.recordActivationEvent.mockResolvedValue(undefined);
  });

  it('clique válido chama verifyOtp e cria a sessão', async () => {
    await expect(
      confirmMagicLink(formData({ token_hash: 'hash-from-email', type: 'email', next: '/app' }))
    ).rejects.toThrow('NEXT_REDIRECT:/app');

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-from-email',
      type: 'email',
    });
  });

  it('encaminha usuário sem onboarding apenas para o onboarding', async () => {
    mocks.isOnboardingComplete.mockResolvedValue(false);

    await expect(
      confirmMagicLink(formData({ token_hash: 'valid', type: 'email', next: '/conta' }))
    ).rejects.toThrow('NEXT_REDIRECT:/onboarding');
  });

  it('preserva uma referência de claim bem formada até /app', async () => {
    await expect(
      confirmMagicLink(formData({
        token_hash: 'valid',
        type: 'email',
        next: '/app',
        claim_ref: claimReference,
      }))
    ).rejects.toThrow(`NEXT_REDIRECT:/app?claim_ref=${encodeURIComponent(claimReference)}`);
  });

  it('descarta referência de claim adulterada antes do redirecionamento', async () => {
    await expect(
      confirmMagicLink(formData({
        token_hash: 'valid',
        type: 'email',
        claim_ref: 'pending-id-puro',
      }))
    ).rejects.toThrow('NEXT_REDIRECT:/app');
  });

  it.each(['expired', 'invalid', 'already_used'])(
    'token %s falha de forma segura com mensagem genérica, sem vazar o token_hash',
    async (code) => {
      mocks.verifyOtp.mockResolvedValue({
        data: { user: null, session: null },
        error: { code },
      });

      await expect(
        confirmMagicLink(formData({ token_hash: 'untrusted-secret', type: 'email' }))
      ).rejects.toThrow('NEXT_REDIRECT:/login?auth_error=link_invalid');

      const redirectMock = vi.mocked(redirect);
      const calledWith = redirectMock.mock.calls.at(-1)?.[0] ?? '';
      expect(calledWith).not.toContain('untrusted-secret');
    }
  );

  it.each([
    formData({}),
    formData({ token_hash: 'hash', type: 'magiclink' }),
    formData({ token_hash: 'hash', type: 'recovery' }),
    formData({ type: 'email' }),
  ])('rejeita parâmetros ausentes ou tipo não autorizado sem consumir o token', async (data) => {
    await expect(confirmMagicLink(data)).rejects.toThrow(
      'NEXT_REDIRECT:/login?auth_error=link_invalid'
    );

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('token já usado (segunda tentativa) continua inválido mesmo após sucesso prévio', async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: { id: 'user-1' }, session: { access_token: 'internal-only' } },
      error: null,
    });

    await expect(
      confirmMagicLink(formData({ token_hash: 'one-time-hash', type: 'email' }))
    ).rejects.toThrow('NEXT_REDIRECT:/app');

    mocks.verifyOtp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: 'already_used' },
    });

    await expect(
      confirmMagicLink(formData({ token_hash: 'one-time-hash', type: 'email' }))
    ).rejects.toThrow('NEXT_REDIRECT:/login?auth_error=link_invalid');
  });

  describe('instrumentação do redirect pós-autenticação', () => {
    it('com claim_ref válido registra auth_confirm_redirect indicando app_with_claim, sem expor a referência', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(
        confirmMagicLink(formData({
          token_hash: 'valid',
          type: 'email',
          next: '/app',
          claim_ref: claimReference,
        }))
      ).rejects.toThrow('NEXT_REDIRECT:');

      const events = logSpy.mock.calls.map(([line]) => JSON.parse(line as string));
      const redirectEvent = events.find((e) => e.event === 'auth_confirm_redirect');

      expect(redirectEvent?.hasClaimReference).toBe(true);
      expect(redirectEvent?.destination).toBe('app_with_claim');
      expect(redirectEvent?.pendingAnalysisId).toBe('6607bfb7-cf9a-40d3-a406-a50291dc4f22');

      const allLoggedText = logSpy.mock.calls.map(([line]) => line).join('\n');
      expect(allLoggedText).not.toContain(claimReference);
      expect(allLoggedText).not.toContain('valid');

      logSpy.mockRestore();
    });

    it('sem claim_ref registra app_without_claim, distinguindo o redirect "/app" puro', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(
        confirmMagicLink(formData({ token_hash: 'valid', type: 'email', next: '/app' }))
      ).rejects.toThrow('NEXT_REDIRECT:/app');

      const events = logSpy.mock.calls.map(([line]) => JSON.parse(line as string));
      const redirectEvent = events.find((e) => e.event === 'auth_confirm_redirect');

      expect(redirectEvent?.hasClaimReference).toBe(false);
      expect(redirectEvent?.destination).toBe('app_without_claim');
      expect(redirectEvent?.pendingAnalysisId).toBeNull();

      logSpy.mockRestore();
    });

    it('usuário sem onboarding com claim é registrado como onboarding_with_claim', async () => {
      mocks.isOnboardingComplete.mockResolvedValue(false);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      await expect(
        confirmMagicLink(formData({
          token_hash: 'valid',
          type: 'email',
          next: '/app',
          claim_ref: claimReference,
        }))
      ).rejects.toThrow('NEXT_REDIRECT:/onboarding?claim_ref=');

      const events = logSpy.mock.calls.map(([line]) => JSON.parse(line as string));
      const redirectEvent = events.find((e) => e.event === 'auth_confirm_redirect');

      expect(redirectEvent?.destination).toBe('onboarding_with_claim');

      logSpy.mockRestore();
    });
  });

  it('neutraliza next externo sem produzir open redirect', async () => {
    await expect(
      confirmMagicLink(
        formData({ token_hash: 'valid', type: 'email', next: 'https://evil.example/steal' })
      )
    ).rejects.toThrow('NEXT_REDIRECT:/app');

    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });
});
