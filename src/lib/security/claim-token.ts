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

const PENDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createClaimReference(pendingAnalysisId: string, claimToken: string): string {
  const signature = crypto
    .createHmac('sha256', claimToken)
    .update(pendingAnalysisId)
    .digest('base64url');

  return `${pendingAnalysisId}.${signature}`;
}

export function parseClaimReference(reference: string): { pendingAnalysisId: string } | null {
  const [pendingAnalysisId, signature, extra] = reference.split('.');
  if (extra || !pendingAnalysisId || !signature || !PENDING_ID_PATTERN.test(pendingAnalysisId)) {
    return null;
  }

  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  return { pendingAnalysisId };
}

export function verifyClaimReference(reference: string, claimToken: string): string | null {
  const parsed = parseClaimReference(reference);
  if (!parsed) return null;

  const expected = createClaimReference(parsed.pendingAnalysisId, claimToken);
  const actualBuffer = Buffer.from(reference);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  return parsed.pendingAnalysisId;
}

export function getClaimCookieName(pendingAnalysisId: string): string {
  return `claim_token_${pendingAnalysisId.replaceAll('-', '')}`;
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
