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

    await expect(LoginPage()).rejects.toThrow('NEXT_REDIRECT:/app');
  });

  it('mantém o formulário de Magic Link quando não há sessão', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await LoginPage();

    expect(result.type).toBe(LoginForm);
  });
});
