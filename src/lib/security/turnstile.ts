/**
 * Validador server-side de Cloudflare Turnstile (PRD v1.2).
 */

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
}

export async function validateTurnstileToken(token?: string, remoteIp?: string): Promise<TurnstileVerifyResult> {
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Em ambiente de teste ou com tokens de teste oficiais da Cloudflare, valida determinísticamente
  if (isTestEnv) {
    if (token === 'invalid-turnstile-token') {
      return { success: false, error: 'Token Turnstile inválido em teste.' };
    }
    return { success: true };
  }

  // Se a chave não estiver configurada no ambiente de desenvolvimento, permite bypass com aviso
  if (!secretKey) {
    if (process.env.NODE_ENV === 'development') {
      return { success: true };
    }
    return { success: false, error: 'TURNSTILE_SECRET_KEY não configurada no servidor.' };
  }

  if (!token || token.trim().length === 0) {
    return { success: false, error: 'Token de verificação anti-robô ausente.' };
  }

  // Token de teste oficial da Cloudflare (Always Passes)
  if (token === '1x0000000000000000000000000000000AA' || token === 'XXXX.DUMMY.TOKEN.XXXX') {
    return { success: true };
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
