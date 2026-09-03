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

  it('neutraliza next externo sem produzir open redirect', async () => {
    await expect(
      confirmMagicLink(
        formData({ token_hash: 'valid', type: 'email', next: 'https://evil.example/steal' })
      )
    ).rejects.toThrow('NEXT_REDIRECT:/app');

    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });
});
