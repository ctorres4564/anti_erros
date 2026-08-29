const ALLOWED_POST_AUTH_PATHS = new Set(['/app', '/conta', '/onboarding']);

export const AUTH_RESEND_COOLDOWN_SECONDS = 60;

export function getLoginErrorMessage(authError: string | null): string | null {
  return authError === 'link_invalid'
    ? 'Este link não é mais válido. Solicite um novo link de acesso.'
    : null;
}

export function getResendLabel(isPending: boolean, cooldownSeconds: number): string {
  if (isPending) return 'Reenviando…';
  if (cooldownSeconds > 0) return `Reenviar em ${cooldownSeconds}s`;
  return 'Reenviar link';
}

export function getSafePostAuthPath(candidate: string | null): string {
  if (!candidate) return '/app';

  return ALLOWED_POST_AUTH_PATHS.has(candidate) ? candidate : '/app';
}
