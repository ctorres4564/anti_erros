import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateTurnstileToken } from '@/lib/security/turnstile';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('validação server-side do Turnstile', () => {
  it('falha fechado em produção quando o secret não está configurado', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    await expect(validateTurnstileToken('qualquer-token')).resolves.toEqual({
      success: false,
      error: 'TURNSTILE_SECRET_KEY não configurada no servidor.',
    });
  });

  it('não aceita token ausente quando há configuração real', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'server-secret');
    await expect(validateTurnstileToken()).resolves.toMatchObject({ success: false });
  });

  it('exige opt-in e token determinístico no bypass de teste', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubEnv('TURNSTILE_TEST_BYPASS', 'true');
    await expect(validateTurnstileToken('test-turnstile-valid')).resolves.toEqual({ success: true });
    await expect(validateTurnstileToken('invalid-turnstile-token')).resolves.toMatchObject({ success: false });
  });

  it('consulta o endpoint oficial e não envia o secret ao cliente', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'server-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(validateTurnstileToken('browser-token', '127.0.0.1')).resolves.toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(String(init.body)).toContain('secret=server-secret');
    expect(String(init.body)).toContain('response=browser-token');
  });
});
