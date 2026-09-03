import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { verifyOtp: mocks.verifyOtp } })),
}));

import AuthConfirmPage from '@/app/auth/confirm/page';
import { ConfirmMagicLink } from '@/components/auth/ConfirmMagicLink';

describe('Página intermediária /auth/confirm (GET passivo)', () => {
  it('não chama verifyOtp apenas ao renderizar a página a partir do link do e-mail', async () => {
    const result = await AuthConfirmPage({
      searchParams: Promise.resolve({ token_hash: 'hash-from-email', type: 'email', next: '/app' }),
    });

    expect(mocks.verifyOtp).not.toHaveBeenCalled();

    // A página apenas repassa os parâmetros preservados ao componente com o botão.
    const confirmElement = result.props.children;
    expect(confirmElement.type).toBe(ConfirmMagicLink);
    expect(confirmElement.props).toEqual({
      tokenHash: 'hash-from-email',
      type: 'email',
      next: '/app',
      claimReference: null,
    });
  });

  it('preserva ausência de parâmetros sem tentar validar nada', async () => {
    const result = await AuthConfirmPage({ searchParams: Promise.resolve({}) });

    expect(mocks.verifyOtp).not.toHaveBeenCalled();

    const confirmElement = result.props.children;
    expect(confirmElement.props).toEqual({ tokenHash: null, type: null, next: null, claimReference: null });
  });
});
