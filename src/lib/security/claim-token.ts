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

/**
 * Calcula o HMAC do IP usando segredo de servidor para telemetria sem PII em claro.
 */
export function hashIpAddress(ip: string): string {
  const secret = process.env.IP_SALT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'anti-erros-salt';
  return crypto.createHmac('sha256', secret).update(ip.trim()).digest('hex');
}
