/**
 * Metadados de uso do Gemini — tipos e extração segura.
 *
 * Regra central: campo ausente permanece AUSENTE. Nunca convertemos ausência
 * em zero, porque zero é um dado (a chamada não gastou aquele tipo de token) e
 * ausência é outro (a API não informou). Também nunca serializamos a resposta
 * inteira do Gemini: apenas os campos numéricos/técnicos listados aqui, para
 * que nenhum texto gerado ou conteúdo pedagógico possa vazar para a telemetria.
 */

import type { Json } from '@/types/database.types';

export interface TokenModalityDetail {
  modality?: string;
  tokenCount?: number;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
  serviceTier?: string;
  promptTokensDetails?: TokenModalityDetail[];
  candidatesTokensDetails?: TokenModalityDetail[];
  cacheTokensDetails?: TokenModalityDetail[];
  toolUsePromptTokensDetails?: TokenModalityDetail[];
}

const NUMERIC_USAGE_FIELDS = [
  'promptTokenCount',
  'candidatesTokenCount',
  'thoughtsTokenCount',
  'cachedContentTokenCount',
  'toolUsePromptTokenCount',
  'totalTokenCount',
] as const;

const DETAIL_USAGE_FIELDS = [
  'promptTokensDetails',
  'candidatesTokensDetails',
  'cacheTokensDetails',
  'toolUsePromptTokensDetails',
] as const;

function toModalityDetails(value: unknown): TokenModalityDetail[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const details = value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const detail: TokenModalityDetail = {};
    if (typeof record.modality === 'string') detail.modality = record.modality;
    if (typeof record.tokenCount === 'number') detail.tokenCount = record.tokenCount;
    return Object.keys(detail).length > 0 ? [detail] : [];
  });

  return details.length > 0 ? details : undefined;
}

/**
 * Copia do `usageMetadata` bruto somente os campos conhecidos e com o tipo
 * esperado. Qualquer outro campo é descartado; campos ausentes continuam ausentes.
 */
export function extractUsageMetadata(raw: unknown): GeminiUsageMetadata | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const source = raw as Record<string, unknown>;
  const usage: GeminiUsageMetadata = {};

  for (const field of NUMERIC_USAGE_FIELDS) {
    const value = source[field];
    if (typeof value === 'number' && Number.isFinite(value)) usage[field] = value;
  }

  if (typeof source.serviceTier === 'string') usage.serviceTier = source.serviceTier;

  for (const field of DETAIL_USAGE_FIELDS) {
    const details = toModalityDetails(source[field]);
    if (details) usage[field] = details;
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
}

export type AiUsageFeature = 'analysis' | 'simple_explanation';

/**
 * Reutiliza a taxonomia de erros já existente no projeto (`AIAnalysisErrorCode`
 * e `SimpleExplanationErrorCode`), acrescentando apenas o caso de sucesso.
 */
export type AiUsageOutcome =
  | 'SUCCESS'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'SCHEMA_INVALID'
  | 'EMPTY_RESPONSE'
  | 'UNKNOWN';

/** Uma chamada real ao Gemini. Um retry gera um registro adicional. */
export interface GeminiCallTelemetry {
  feature: AiUsageFeature;
  requestedModel: string;
  servedModel?: string;
  usage?: GeminiUsageMetadata;
  latencyMs: number;
  attempt: number;
  isRetry: boolean;
  outcome: AiUsageOutcome;
}

export type GeminiCallTelemetryHook = (telemetry: GeminiCallTelemetry) => void;

/**
 * Achata a telemetria no formato gravado em `properties`. Só entram metadados
 * técnicos; chaves com valor ausente são omitidas (nunca viram zero ou null).
 */
export function toUsageEventProperties(telemetry: GeminiCallTelemetry): Record<string, Json> {
  const properties: Record<string, Json> = {
    feature: telemetry.feature,
    requestedModel: telemetry.requestedModel,
    latencyMs: telemetry.latencyMs,
    attempt: telemetry.attempt,
    isRetry: telemetry.isRetry,
    outcome: telemetry.outcome,
  };

  if (telemetry.servedModel !== undefined) properties.servedModel = telemetry.servedModel;

  const usage = telemetry.usage;
  if (usage) {
    for (const field of NUMERIC_USAGE_FIELDS) {
      if (usage[field] !== undefined) properties[field] = usage[field] as number;
    }
    if (usage.serviceTier !== undefined) properties.serviceTier = usage.serviceTier;
    for (const field of DETAIL_USAGE_FIELDS) {
      const details = usage[field];
      if (details) properties[field] = details as unknown as Json;
    }
  }

  return properties;
}
