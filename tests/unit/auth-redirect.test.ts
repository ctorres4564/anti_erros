import { describe, expect, it } from 'vitest';
import {
  AUTH_RESEND_COOLDOWN_SECONDS,
  getLoginErrorMessage,
  getResendLabel,
  getSafePostAuthPath,
} from '@/lib/auth/redirect';

describe('auth redirect and login UX policy', () => {
  it.each(['/app', '/conta', '/onboarding'])('permite o destino interno %s', (path) => {
    expect(getSafePostAuthPath(path)).toBe(path);
  });

  it.each([
    'https://evil.example/steal',
    '//evil.example/steal',
    '/app?token=secret',
    '/analises/another-user',
    'javascript:alert(1)',
  ])('rejeita destino não autorizado %s', (path) => {
    expect(getSafePostAuthPath(path)).toBe('/app');
  });

  it('não reflete mensagens arbitrárias de erro na interface', () => {
    expect(getLoginErrorMessage('link_invalid')).toBe(
      'Este link não é mais válido. Solicite um novo link de acesso.'
    );
    expect(getLoginErrorMessage('mensagem controlada pelo atacante')).toBeNull();
  });

  it('aplica cooldown explícito antes do reenvio', () => {
    expect(AUTH_RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(getResendLabel(false, 60)).toBe('Reenviar em 60s');
    expect(getResendLabel(true, 0)).toBe('Reenviando…');
    expect(getResendLabel(false, 0)).toBe('Reenviar link');
  });
});
