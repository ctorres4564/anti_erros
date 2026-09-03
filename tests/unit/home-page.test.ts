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

import HomePage from '@/app/page';
import { AnonymousAnalysisExperience } from '@/components/analysis/AnonymousAnalysisExperience';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redireciona usuário autenticado para /app em vez de entrar no fluxo anônimo', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    await expect(HomePage()).rejects.toThrow('NEXT_REDIRECT:/app');
  });

  it('mantém o fluxo anônimo quando não há sessão', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const result = await HomePage();

    expect(result.type).toBe(AnonymousAnalysisExperience);
  });
});
