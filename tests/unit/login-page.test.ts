import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

import LoginPage from '@/app/login/page';
import { LoginForm } from '@/components/auth/LoginForm';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redireciona usuário já autenticado para /app sem pedir e-mail novamente', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/app');
  });

  it('mantém o formulário de Magic Link quando não há sessão', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await LoginPage({ searchParams: Promise.resolve({}) });

    expect(result.type).toBe(LoginForm);
  });

  it('leva a referência específica para /app quando a sessão já existe', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const reference = `6607bfb7-cf9a-40d3-a406-a50291dc4f22.${'a'.repeat(43)}`;

    await expect(
      LoginPage({ searchParams: Promise.resolve({ claim_ref: reference }) })
    ).rejects.toThrow(`NEXT_REDIRECT:/app?claim_ref=${encodeURIComponent(reference)}`);
  });
});
