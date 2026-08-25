/**
 * Rate Limiting em memória para o endpoint de análise anônima.
 * Proteção secundária em complemento ao Cloudflare Turnstile.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const anonymousRateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Verifica e consome cota do rate limiter por chave (anonymousId ou ipHmac).
 * @param key Identificador (ex: anonymous_id ou ip_hmac)
 * @param maxRequests Máximo de requisições permitidas na janela (padrão: 10/hora por IP, 2/dia por anonId)
 * @param windowMs Janela de tempo em milissegundos
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 60 * 1000
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const record = anonymousRateLimitStore.get(key);

  if (!record || record.resetAt <= now) {
    anonymousRateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetInMs: windowMs,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: record.resetAt - now,
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetInMs: record.resetAt - now,
  };
}

/** Limpa registros expirados periodicamente da memória. */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, record] of anonymousRateLimitStore.entries()) {
    if (record.resetAt <= now) {
      anonymousRateLimitStore.delete(key);
    }
  }
}
