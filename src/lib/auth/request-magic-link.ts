interface PasswordlessAuthClient {
  signInWithOtp(credentials: { email: string }): Promise<{
    error: { code?: string } | null;
  }>;
}
export function requestMagicLink(auth: PasswordlessAuthClient, email: string) {
  // A URL vem do template token_hash configurado no Supabase. Não iniciamos
  // PKCE no navegador nem vinculamos o link ao storage deste dispositivo.
  return auth.signInWithOtp({ email });
}
