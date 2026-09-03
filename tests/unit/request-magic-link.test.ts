import { describe, expect, it, vi } from 'vitest';
import { requestMagicLink } from '@/lib/auth/request-magic-link';

describe('requestMagicLink', () => {
  it('solicita OTP sem redirect PKCE, verifier ou token sensível no cliente', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    await requestMagicLink({ signInWithOtp }, 'student@example.com');

    expect(signInWithOtp).toHaveBeenCalledWith({ email: 'student@example.com' });
    expect(signInWithOtp.mock.calls[0]?.[0]).not.toHaveProperty('options');
  });

  it('preserva a referência opaca no destino do Magic Link sem expor o claim token', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const destination = 'https://app.example/auth/confirm?claim_ref=signed-reference';

    await requestMagicLink({ signInWithOtp }, 'student@example.com', destination);

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      options: { emailRedirectTo: destination },
    });
  });
});
