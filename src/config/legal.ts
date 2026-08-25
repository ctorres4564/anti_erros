/**
 * Configuração centralizada e imutável das versões dos documentos legais (LGPD / Termos de Uso).
 * NUNCA utilize strings literais de versão espalhadas nos componentes.
 */

export const LEGAL_VERSIONS = {
  terms: process.env.LEGAL_TERMS_VERSION || 'v1.0.0',
  privacy: process.env.LEGAL_PRIVACY_VERSION || 'v1.0.0',
  marketing: process.env.MARKETING_POLICY_VERSION || 'v1.0.0',
} as const;

export type LegalVersions = typeof LEGAL_VERSIONS;
