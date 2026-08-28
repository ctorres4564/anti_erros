/**
 * Validador server-side de Cloudflare Turnstile (PRD v1.2).
 */

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

export async function validateTurnstileToken(token?: string, remoteIp?: string): Promise<TurnstileVerifyResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // O bypass local só existe sem credenciais e nunca é aplicado em produção.
  if (!secretKey) {
    if (process.env.NODE_ENV === 'development') {
      return { success: true };
    }
    return { success: false, error: 'TURNSTILE_SECRET_KEY não configurada no servidor.' };
  }

  if (!token || token.trim().length === 0) {
    return { success: false, error: 'Token de verificação anti-robô ausente.' };
  }

  // Testes automatizados precisam optar explicitamente pelo token determinístico.
  if (!isProduction && isTestEnv && process.env.TURNSTILE_TEST_BYPASS === 'true') {
    return token === 'test-turnstile-valid'
      ? { success: true }
      : { success: false, error: 'Token Turnstile inválido em teste.' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      return { success: false, error: `Falha na verificação Turnstile (HTTP ${response.status}).` };
    }

    const data = (await response.json()) as { success: boolean; 'error-codes'?: string[] };
    if (!data.success) {
      return {
        success: false,
        error: `Verificação anti-robô falhou: ${data['error-codes']?.join(', ') || 'código inválido'}`,
      };
    }

    return { success: true };
  } catch (err) {
    console.error('Erro de comunicação com Cloudflare Turnstile:', err);
    return { success: false, error: 'Erro ao validar verificação anti-robô.' };
  }
}
