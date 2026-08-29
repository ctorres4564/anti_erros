import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: mocks.signOut } })),
}));

import { POST } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it('encerra a sessão Supabase', async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('não informa sucesso quando o Supabase rejeita o logout', async () => {
    mocks.signOut.mockResolvedValue({ error: { code: 'signout_failed' } });

    const response = await POST();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Falha ao encerrar a sessão.' });
  });
});
