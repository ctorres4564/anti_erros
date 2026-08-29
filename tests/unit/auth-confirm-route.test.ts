import { NextRequest } from 'next/server';
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

import { GET } from '@/app/auth/confirm/route';

function request(query: string) {
  return new NextRequest(`https://anti-erros.metodoaprender.com/auth/confirm?${query}`);
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'internal-only' } },
      error: null,
    });
    mocks.isOnboardingComplete.mockResolvedValue(true);
    mocks.recordActivationEvent.mockResolvedValue(undefined);
  });

  it('valida token_hash sem depender de code verifier e cria a sessão', async () => {
    const response = await GET(request('token_hash=hash-from-email&type=email&next=/app'));

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: 'hash-from-email',
      type: 'email',
    });
    expect(response.headers.get('location')).toBe('https://anti-erros.metodoaprender.com/app');
    expect(response.headers.get('location')).not.toMatch(/token|code|access|refresh|claim/i);
  });

  it('encaminha usuário sem onboarding apenas para o onboarding', async () => {
    mocks.isOnboardingComplete.mockResolvedValue(false);

    const response = await GET(request('token_hash=valid&type=email&next=/conta'));

    expect(response.headers.get('location')).toBe('https://anti-erros.metodoaprender.com/onboarding');
  });

  it.each(['expired', 'invalid', 'already_used'])('trata token %s com mensagem genérica', async (code) => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code },
    });

    const response = await GET(request('token_hash=untrusted-secret&type=email'));
    const location = response.headers.get('location') ?? '';

    expect(location).toBe(
      'https://anti-erros.metodoaprender.com/login?auth_error=link_invalid'
    );
    expect(location).not.toContain('untrusted-secret');
  });

  it.each([
    '',
    'token_hash=hash&type=magiclink',
    'token_hash=hash&type=recovery',
    'type=email',
  ])('rejeita parâmetros ausentes ou tipo não autorizado: %s', async (query) => {
    const response = await GET(request(query));

    expect(response.headers.get('location')).toBe(
      'https://anti-erros.metodoaprender.com/login?auth_error=link_invalid'
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('neutraliza next externo sem produzir open redirect', async () => {
    const response = await GET(
      request('token_hash=valid&type=email&next=https%3A%2F%2Fevil.example%2Fsteal')
    );

    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe('https://anti-erros.metodoaprender.com/app');
  });
});
