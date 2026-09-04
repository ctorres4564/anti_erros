import { AI_MAX_SCHEMA_RETRIES, AI_MODEL, AI_REQUEST_TIMEOUT_MS, DISCIPLINES, EVIDENCE_SOURCES, EVIDENCE_SUPPORT_TYPES } from '@/config/ai';
import { analysisOutputSchema, enforceDiagnosticInvariants, type AnalysisInput, type AnalysisOutput } from './analysis-schema';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from './analysis-prompt';
import {
  extractUsageMetadata,
  type GeminiCallTelemetryHook,
  type GeminiUsageMetadata,
} from './usage';

export type AIAnalysisErrorCode = 'TIMEOUT' | 'HTTP_ERROR' | 'SCHEMA_INVALID' | 'EMPTY_RESPONSE' | 'UNKNOWN';

export class AIAnalysisError extends Error {
  constructor(
    public readonly code: AIAnalysisErrorCode,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AIAnalysisError';
  }
}

export interface AIAnalysisUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  retries: number;
}

export interface AIAnalysisResult {
  output: AnalysisOutput;
  modelVersion: string;
  usage: AIAnalysisUsage;
}

/** Ganchos opcionais de observabilidade — não alteram o contrato de análise. */
export interface AIAnalysisHooks {
  /** Chamado uma vez por chamada REAL ao Gemini (inclusive nas que falharam). */
  onGeminiCall?: GeminiCallTelemetryHook;
}

/** Interface do motor de IA — injetável, para permitir mocks determinísticos em testes. */
export interface AIAnalysisClient {
  analyze(input: AnalysisInput, hooks?: AIAnalysisHooks): Promise<AIAnalysisResult>;
}

/** Schema JSON (dialeto OpenAPI/Gemini) espelhando analysisOutputSchema para Structured Output. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    discipline: {
      type: 'STRING',
      enum: DISCIPLINES,
    },
    // observableBehavior e diagnosticEvidence aparecem ANTES de probableErrorType
    // deliberadamente: no Structured Output do Gemini, a ordem de `properties` reflete
    // a ordem de geração token a token. Isso é uma decomposição diagnóstica estruturada
    // (não uma "chain-of-thought") que faz o modelo se comprometer com o erro observado
    // e a suficiência/evidência ANTES de emitir a causa escolhida, dentro da MESMA
    // chamada (analysis-v2.4).
    observableBehavior: { type: 'STRING' },
    diagnosticEvidence: {
      type: 'OBJECT',
      properties: {
        sufficient: { type: 'BOOLEAN' },
        evidenceSource: { type: 'STRING', enum: EVIDENCE_SOURCES, nullable: true },
        evidenceQuote: { type: 'STRING', nullable: true },
        supportType: { type: 'STRING', enum: EVIDENCE_SUPPORT_TYPES },
        competingCauses: {
          type: 'ARRAY',
          items: {
            type: 'STRING',
            enum: [
              'KNOWLEDGE_GAP',
              'CONCEPT_CONFUSION',
              'EXCEPTION_MISSED',
              'APPLICATION_ERROR',
              'READING_ERROR',
              'INSUFFICIENT_INFORMATION',
            ],
          },
        },
      },
      required: ['sufficient', 'evidenceSource', 'evidenceQuote', 'supportType', 'competingCauses'],
    },
    probableErrorType: {
      type: 'STRING',
      enum: [
        'KNOWLEDGE_GAP',
        'CONCEPT_CONFUSION',
        'EXCEPTION_MISSED',
        'APPLICATION_ERROR',
        'READING_ERROR',
        'INSUFFICIENT_INFORMATION',
      ],
    },
    confidence: { type: 'NUMBER' },
    reasoningSummary: { type: 'STRING' },
    recommendedAction: { type: 'STRING' },
    coreConcept: { type: 'STRING' },
    cardAction: {
      type: 'STRING',
      enum: [
        'CREATE_BASIC_CARD',
        'CREATE_DISCRIMINATION_CARD',
        'CREATE_EXCEPTION_CARD',
        'CREATE_APPLICATION_CARD',
        'NO_CARD',
      ],
    },
    card: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        front: { type: 'STRING' },
        back: { type: 'STRING' },
      },
      required: ['front', 'back'],
    },
  },
  required: ['discipline', 'probableErrorType', 'confidence', 'reasoningSummary', 'recommendedAction', 'coreConcept', 'cardAction', 'card'],
} as const;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    [key: string]: unknown;
  };
  modelVersion?: string;
}

function extractResponseText(payload: GeminiGenerateContentResponse): string | null {
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return text.trim().length > 0 ? text : null;
}

async function callGeminiOnce(params: {
  apiKey: string;
  model: string;
  userPrompt: string;
  timeoutMs: number;
}): Promise<{
  text: string;
  inputTokens: number;
  outputTokens: number;
  usage?: GeminiUsageMetadata;
  servedModel?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': params.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AIAnalysisError('TIMEOUT', `Timeout de ${params.timeoutMs}ms ao chamar o Gemini.`, err);
    }
    throw new AIAnalysisError('UNKNOWN', 'Falha de rede ao chamar o Gemini.', err);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    throw new AIAnalysisError('HTTP_ERROR', `Gemini retornou HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
  }

  const json = (await response.json()) as GeminiGenerateContentResponse;
  const text = extractResponseText(json);
  if (!text) {
    throw new AIAnalysisError('EMPTY_RESPONSE', 'Gemini retornou resposta vazia.');
  }

  return {
    text,
    // Campos legados mantidos por compatibilidade; a contagem completa (inclusive
    // thoughtsTokenCount e totalTokenCount) vai em `usage`.
    inputTokens: json.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: json.usageMetadata?.candidatesTokenCount ?? 0,
    usage: extractUsageMetadata(json.usageMetadata),
    servedModel: typeof json.modelVersion === 'string' ? json.modelVersion : undefined,
  };
}

function parseAndValidate(text: string, input: AnalysisInput): AnalysisOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new AIAnalysisError('SCHEMA_INVALID', 'Resposta do Gemini não é um JSON válido.', err);
  }

  const result = analysisOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new AIAnalysisError('SCHEMA_INVALID', `Resposta do Gemini violou o schema: ${result.error.message}`);
  }

  return enforceDiagnosticInvariants(input, result.data);
}

export interface GeminiAnalysisClientOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxSchemaRetries?: number;
}

/** Implementação real do motor de IA, via API REST do Gemini (Structured Output). */
export class GeminiAnalysisClient implements AIAnalysisClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxSchemaRetries: number;

  constructor(options: GeminiAnalysisClientOptions) {
    if (!options.apiKey) {
      throw new Error('GeminiAnalysisClient requer uma apiKey.');
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? AI_MODEL;
    this.timeoutMs = options.timeoutMs ?? AI_REQUEST_TIMEOUT_MS;
    this.maxSchemaRetries = options.maxSchemaRetries ?? AI_MAX_SCHEMA_RETRIES;
  }

  async analyze(input: AnalysisInput, hooks?: AIAnalysisHooks): Promise<AIAnalysisResult> {
    const userPrompt = buildAnalysisUserPrompt(input);
    const startedAt = Date.now();

    let lastError: AIAnalysisError | null = null;
    let retries = 0;

    for (let attempt = 0; attempt <= this.maxSchemaRetries; attempt++) {
      if (attempt > 0) retries++;
      const attemptStartedAt = Date.now();

      // Telemetria é best-effort: um hook com defeito nunca pode derrubar a análise.
      const emit = (
        outcome: AIAnalysisErrorCode | 'SUCCESS',
        extra: { usage?: GeminiUsageMetadata; servedModel?: string } = {}
      ) => {
        try {
          hooks?.onGeminiCall?.({
            feature: 'analysis',
            requestedModel: this.model,
            latencyMs: Date.now() - attemptStartedAt,
            attempt: attempt + 1,
            isRetry: attempt > 0,
            outcome,
            ...extra,
          });
        } catch {
          // silencioso por design
        }
      };

      let call: Awaited<ReturnType<typeof callGeminiOnce>>;
      try {
        call = await callGeminiOnce({
          apiKey: this.apiKey,
          model: this.model,
          userPrompt,
          timeoutMs: this.timeoutMs,
        });
      } catch (err) {
        const aiErr =
          err instanceof AIAnalysisError ? err : new AIAnalysisError('UNKNOWN', 'Erro desconhecido no motor de IA.', err);
        // Falhou antes de haver contagem de tokens: registra a chamada sem usage
        // (potencialmente cobrada), sem inventar zeros.
        emit(aiErr.code);
        lastError = aiErr;

        if (aiErr.code !== 'SCHEMA_INVALID') throw aiErr;
        continue;
      }

      try {
        const output = parseAndValidate(call.text, input);

        emit('SUCCESS', { usage: call.usage, servedModel: call.servedModel });

        return {
          output,
          modelVersion: this.model,
          usage: {
            inputTokens: call.inputTokens,
            outputTokens: call.outputTokens,
            latencyMs: Date.now() - startedAt,
            retries,
          },
        };
      } catch (err) {
        const aiErr =
          err instanceof AIAnalysisError ? err : new AIAnalysisError('UNKNOWN', 'Erro desconhecido no motor de IA.', err);
        // A chamada retornou (e foi cobrada) mesmo com schema inválido: o usage existe.
        emit(aiErr.code, { usage: call.usage, servedModel: call.servedModel });
        lastError = aiErr;

        if (aiErr.code !== 'SCHEMA_INVALID') {
          throw aiErr;
        }
      }
    }

    throw lastError ?? new AIAnalysisError('UNKNOWN', 'Falha desconhecida após retries.');
  }
}

/** Fábrica do client real, lendo configuração exclusivamente do ambiente server-side. */
export function createGeminiAnalysisClient(): GeminiAnalysisClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no servidor.');
  }
  return new GeminiAnalysisClient({ apiKey, model: AI_MODEL });
}
