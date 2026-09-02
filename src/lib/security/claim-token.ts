import crypto from 'crypto';

/**
 * Gera um token de resgate criptograficamente seguro e de alta entropia (256 bits).
 */
export function generateClaimToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calcula o hash SHA-256 do token para armazenamento seguro no banco de dados.
 * O token bruto NUNCA é persistido em texto claro.
 */
export function hashClaimToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Gera um identificador pseudônimo para a sessão anônima do navegador.
 */
export function generateAnonymousId(): string {
  return `anon_${crypto.randomBytes(16).toString('hex')}`;
}

let ephemeralDevIpSalt: string | undefined;

/**
 * Resolve o segredo usado para o HMAC do IP. Em produção, `IP_SALT_SECRET` é
 * obrigatória — sem fallback para outro segredo (nunca reaproveita
 * SUPABASE_SERVICE_ROLE_KEY) e sem valor fixo no código-fonte. Fora de
 * produção, gera um valor efêmero por processo para não exigir configuração
 * local, sem nunca reutilizar um segredo hardcoded.
 */
function resolveIpSaltSecret(): string {
  const secret = process.env.IP_SALT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'IP_SALT_SECRET não configurada no servidor. Obrigatória em produção para o hashing seguro de IPs.'
    );
  }

  ephemeralDevIpSalt ??= crypto.randomBytes(32).toString('hex');
  return ephemeralDevIpSalt;
}

/**
 * Calcula o HMAC do IP usando segredo de servidor para telemetria sem PII em claro.
 */
export function hashIpAddress(ip: string): string {
  const secret = resolveIpSaltSecret();
  return crypto.createHmac('sha256', secret).update(ip.trim()).digest('hex');
}
