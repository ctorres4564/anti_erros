import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

async function importFreshHashIpAddress() {
  vi.resetModules();
  const mod = await import('@/lib/security/claim-token');
  return mod.hashIpAddress;
}

describe('hashIpAddress', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('usa IP_SALT_SECRET quando configurada, em qualquer ambiente', async () => {
    process.env.IP_SALT_SECRET = 'segredo-de-teste-explicito';
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const hashIpAddress = await importFreshHashIpAddress();
    const expected = crypto.createHmac('sha256', 'segredo-de-teste-explicito').update('203.0.113.10').digest('hex');

    expect(hashIpAddress('203.0.113.10')).toBe(expected);
  });

  it('falha de forma explícita em produção quando IP_SALT_SECRET está ausente', async () => {
    delete process.env.IP_SALT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const hashIpAddress = await importFreshHashIpAddress();

    expect(() => hashIpAddress('203.0.113.10')).toThrow('IP_SALT_SECRET não configurada no servidor.');
  });

  it('nunca usa SUPABASE_SERVICE_ROLE_KEY como fallback do segredo em produção', async () => {
    delete process.env.IP_SALT_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-nao-deve-ser-usada';
    (process.env as Record<string, string>).NODE_ENV = 'production';

    const hashIpAddress = await importFreshHashIpAddress();

    expect(() => hashIpAddress('203.0.113.10')).toThrow();
  });

  it('fora de produção, sem IP_SALT_SECRET, não lança e não usa o literal antigo "anti-erros-salt" nem SUPABASE_SERVICE_ROLE_KEY', async () => {
    delete process.env.IP_SALT_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-nao-deve-ser-usada';
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const hashIpAddress = await importFreshHashIpAddress();
    const result = hashIpAddress('203.0.113.10');

    const oldHardcodedFallback = crypto.createHmac('sha256', 'anti-erros-salt').update('203.0.113.10').digest('hex');
    const serviceRoleFallback = crypto
      .createHmac('sha256', 'service-role-key-nao-deve-ser-usada')
      .update('203.0.113.10')
      .digest('hex');

    expect(() => hashIpAddress('203.0.113.10')).not.toThrow();
    expect(result).not.toBe(oldHardcodedFallback);
    expect(result).not.toBe(serviceRoleFallback);
  });

  it('fora de produção, sem IP_SALT_SECRET, o segredo efêmero é estável dentro do mesmo processo', async () => {
    delete process.env.IP_SALT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = 'development';

    const hashIpAddress = await importFreshHashIpAddress();

    expect(hashIpAddress('203.0.113.10')).toBe(hashIpAddress('203.0.113.10'));
  });
});
