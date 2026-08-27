/**
 * Runner de avaliação final cega — executa analysis-v2.0 UMA ÚNICA VEZ contra
 * holdout-v1 (120 casos, congelado). Política técnica (retry, timeout, rate
 * limit) duplicada sem alteração de scripts/benchmark/run-benchmark.ts —
 * arquivo separado para não modificar o runner do benchmark-v2 (dev set) nem
 * os arquivos congelados do holdout.
 *
 * Uso: npx tsx scripts/benchmark/run-holdout.ts
 *
 * O modelo recebe SOMENTE question/userAnswer/correctAnswer/officialExplanation
 * (via buildAnalysisUserPrompt, igual à produção). Nenhum campo de ground
 * truth (expectedErrorType, acceptableErrorTypes, observability,
 * expectedCardDecision, justification, promptInjectionCase) é enviado ao
 * modelo — diagnóstico cego preservado.
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { holdoutV1Cases, type HoldoutV1Case } from './holdout-v1-cases';
import { analysisOutputSchema } from '../../src/lib/ai/analysis-schema';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, PROMPT_VERSION } from '../../src/lib/ai/analysis-prompt';
import { GEMINI_RESPONSE_SCHEMA } from '../../src/lib/ai/gemini';

const MODEL = 'gemini-3.7-flash'; // candidato "medium" (sem thinkingLevel override, igual ao dev run de analysis-v2.0)

interface CallResult {
  caseId: string;
  ok: boolean;
  httpStatus?: number;
  errorKind?: 'HTTP_ERROR' | 'TIMEOUT' | 'SCHEMA_INVALID' | 'EMPTY_RESPONSE' | 'UNKNOWN';
  errorMessage?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  retries: number;
  output?: unknown;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxPerWindow: number,
    private windowMs: number
  ) {}

  async acquire() {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.maxPerWindow) {
        this.timestamps.push(now);
        return;
      }
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await sleep(Math.max(waitMs, 100));
    }
  }
}

async function callModel(apiKey: string, holdoutCase: HoldoutV1Case, timeoutMs = 60000): Promise<CallResult> {
  const userPrompt = buildAnalysisUserPrompt({
    question: holdoutCase.question,
    userAnswer: holdoutCase.userAnswer,
    correctAnswer: holdoutCase.correctAnswer,
    officialExplanation: holdoutCase.officialExplanation,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;

    if (res.status === 429 || res.status === 503) {
      const bodyText = await res.text().catch(() => '');
      return {
        caseId: holdoutCase.id,
        ok: false,
        httpStatus: res.status,
        errorKind: 'HTTP_ERROR',
        errorMessage: bodyText.slice(0, 200),
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        retries: 0,
      };
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      return {
        caseId: holdoutCase.id,
        ok: false,
        httpStatus: res.status,
        errorKind: 'HTTP_ERROR',
        errorMessage: bodyText.slice(0, 200),
        latencyMs,
        inputTokens: 0,
        outputTokens: 0,
        retries: 0,
      };
    }

    const json = await res.json();
    const text: string = json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;

    if (!text.trim()) {
      return { caseId: holdoutCase.id, ok: false, errorKind: 'EMPTY_RESPONSE', latencyMs, inputTokens, outputTokens, retries: 0 };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        caseId: holdoutCase.id,
        ok: false,
        errorKind: 'SCHEMA_INVALID',
        errorMessage: 'JSON inválido',
        latencyMs,
        inputTokens,
        outputTokens,
        retries: 0,
      };
    }

    const validation = analysisOutputSchema.safeParse(parsed);
    if (!validation.success) {
      process.stderr.write(
        `\n[DEBUG SCHEMA_INVALID - ${holdoutCase.id}]\nZod issues: ${JSON.stringify(validation.error.issues, null, 2)}\nRaw JSON: ${JSON.stringify(parsed, null, 2)}\n\n`
      );
      return {
        caseId: holdoutCase.id,
        ok: false,
        errorKind: 'SCHEMA_INVALID',
        errorMessage: validation.error.message.slice(0, 300),
        latencyMs,
        inputTokens,
        outputTokens,
        retries: 0,
      };
    }

    return {
      caseId: holdoutCase.id,
      ok: true,
      latencyMs,
      inputTokens,
      outputTokens,
      retries: 0,
      output: validation.data,
    };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      caseId: holdoutCase.id,
      ok: false,
      errorKind: isAbort ? 'TIMEOUT' : 'UNKNOWN',
      errorMessage: err instanceof Error ? err.message : String(err),
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      retries: 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callModelWithRetry(apiKey: string, holdoutCase: HoldoutV1Case, limiter: RateLimiter): Promise<CallResult> {
  let lastResult: CallResult | null = null;
  let schemaRetries = 0;
  const maxSchemaRetries = 1;
  const maxTransientRetries = 2;
  let attempt = 0;

  while (attempt <= 3) {
    await limiter.acquire();
    const result = await callModel(apiKey, holdoutCase, 60000);
    if (result.ok) return { ...result, retries: attempt };
    lastResult = result;

    if (result.errorKind === 'SCHEMA_INVALID' && schemaRetries < maxSchemaRetries) {
      schemaRetries++;
      attempt++;
      await sleep(1000);
      continue;
    }

    if ((result.httpStatus === 429 || result.httpStatus === 503) && attempt < maxTransientRetries) {
      attempt++;
      await sleep(5000 * attempt);
      continue;
    }

    return { ...result, retries: attempt };
  }
  return { ...(lastResult as CallResult), retries: attempt };
}

function computeP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('BLOQUEADOR: GEMINI_API_KEY ausente. Avaliação real não pode ser executada.');
    process.exit(1);
  }

  console.error(`Holdout-v1: ${holdoutV1Cases.length} casos. Modelo: ${MODEL}. PROMPT_VERSION: ${PROMPT_VERSION}.`);

  const limiter = new RateLimiter(12, 60_000);
  const results: Array<{
    caseId: string;
    ok: boolean;
    predictedType?: string;
    predictedCardAction?: string;
    confidence?: number;
    errorKind?: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    retries: number;
    rawOutput?: unknown;
  }> = [];

  let done = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalRetries = 0;
  let httpFailures = 0;
  let timeouts = 0;
  let schemaFailures = 0;
  const latenciesMs: number[] = [];

  for (const holdoutCase of holdoutV1Cases) {
    const result = await callModelWithRetry(apiKey, holdoutCase, limiter);
    done++;
    process.stderr.write(
      `[holdout-v1] ${done}/${holdoutV1Cases.length} ${holdoutCase.id} -> ${result.ok ? 'OK' : result.errorKind} ${!result.ok ? JSON.stringify(result.errorMessage) : ''}\n`
    );

    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;
    totalRetries += result.retries;
    latenciesMs.push(result.latencyMs);

    if (!result.ok) {
      if (result.errorKind === 'TIMEOUT') timeouts++;
      else if (result.errorKind === 'SCHEMA_INVALID') schemaFailures++;
      else httpFailures++;
      results.push({
        caseId: holdoutCase.id,
        ok: false,
        errorKind: result.errorKind,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        retries: result.retries,
      });
      continue;
    }

    const output = result.output as { probableErrorType: string; cardAction: string; confidence: number };
    results.push({
      caseId: holdoutCase.id,
      ok: true,
      predictedType: output.probableErrorType,
      predictedCardAction: output.cardAction,
      confidence: output.confidence,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      retries: result.retries,
      rawOutput: result.output,
    });
  }

  const report = {
    holdoutVersion: 'holdout-v1',
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    totalCases: holdoutV1Cases.length,
    schemaCompliant: results.filter((r) => r.ok).length,
    schemaComplianceRate: results.filter((r) => r.ok).length / holdoutV1Cases.length,
    avgLatencyMs: latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length,
    p95LatencyMs: computeP95(latenciesMs),
    totalRetries,
    httpFailures,
    timeouts,
    schemaFailures,
    totalInputTokens,
    totalOutputTokens,
    executedAt: new Date().toISOString(),
    results,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('ERRO FATAL NA AVALIAÇÃO DO HOLDOUT:', err);
  process.exit(1);
});
