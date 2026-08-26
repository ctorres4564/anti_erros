/**
 * Runner do benchmark real de modelos Gemini (Sprint 3).
 *
 * Uso:
 *   npx tsx scripts/benchmark/run-benchmark.ts --models=gemini-3.6-flash,gemini-3.7-flash
 *
 * Requer GEMINI_API_KEY em .env.local. NUNCA simula resultados: se a chave
 * estiver ausente, falha explicitamente em vez de fabricar métricas.
 *
 * Respeita rate limit observado empiricamente (~20 req/min por modelo nesta
 * chave — ver docs/SPRINT_3_MODEL_BENCHMARK.md) com um limitador conservador
 * e backoff em 429/503.
 */
import { readFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { BENCHMARK_DATASET, BENCHMARK_DATASET_VERSION, type BenchmarkCase } from './dataset';
import { analysisOutputSchema } from '../../src/lib/ai/analysis-schema';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from '../../src/lib/ai/analysis-prompt';
import { GEMINI_RESPONSE_SCHEMA } from '../../src/lib/ai/gemini';
import { LOW_CONFIDENCE_THRESHOLD } from '../../src/config/ai';

// Preço nominal por 1M tokens (USD), tier "flash" gratuito/pago padrão declarado publicamente pela
// Google para a família Gemini 3 na época do benchmark. Usado apenas para o cálculo de
// custo estimado/1000 análises válidas — NÃO é uma medição de cobrança real desta conta.
const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gemini-3.6-flash': { input: 0.2, output: 1.0 },
  'gemini-3.7-flash': { input: 0.2, output: 1.0 },
};

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

/** Limitador de taxa simples: no máximo `maxPerWindow` chamadas iniciadas a cada `windowMs`. */
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

async function callModel(model: string, apiKey: string, benchCase: BenchmarkCase, timeoutMs = 60000): Promise<CallResult> {
  const userPrompt = buildAnalysisUserPrompt({
    question: benchCase.question,
    userAnswer: benchCase.userAnswer,
    correctAnswer: benchCase.correctAnswer,
    officialExplanation: benchCase.officialExplanation,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
        caseId: benchCase.id,
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
        caseId: benchCase.id,
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
      return { caseId: benchCase.id, ok: false, errorKind: 'EMPTY_RESPONSE', latencyMs, inputTokens, outputTokens, retries: 0 };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        caseId: benchCase.id,
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
      // Log seguro sem credenciais/headers para depuração de schema inválido
      process.stderr.write(
        `\n[DEBUG SCHEMA_INVALID - ${model} - ${benchCase.id}]\nZod issues: ${JSON.stringify(validation.error.issues, null, 2)}\nRaw JSON: ${JSON.stringify(parsed, null, 2)}\n\n`
      );
      return {
        caseId: benchCase.id,
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
      caseId: benchCase.id,
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
      caseId: benchCase.id,
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

async function callModelWithRetry(
  model: string,
  apiKey: string,
  benchCase: BenchmarkCase,
  limiter: RateLimiter
): Promise<CallResult> {
  let lastResult: CallResult | null = null;
  let schemaRetries = 0;
  const maxSchemaRetries = 1;
  const maxTransientRetries = 2;
  let attempt = 0;

  while (attempt <= 3) {
    await limiter.acquire();
    const result = await callModel(model, apiKey, benchCase, 60000);
    if (result.ok) return { ...result, retries: attempt };
    lastResult = result;

    // Retry em SCHEMA_INVALID (máximo 1 retry controlado)
    if (result.errorKind === 'SCHEMA_INVALID' && schemaRetries < maxSchemaRetries) {
      schemaRetries++;
      attempt++;
      await sleep(1000);
      continue;
    }

    // Retry em 429/503 (máximo 2 retries com backoff)
    if ((result.httpStatus === 429 || result.httpStatus === 503) && attempt < maxTransientRetries) {
      attempt++;
      await sleep(5000 * attempt);
      continue;
    }

    // Para outros erros (ex.: TIMEOUT, EMPTY_RESPONSE) ou retries esgotados, não fazer novos retries
    return { ...result, retries: attempt };
  }
  return { ...(lastResult as CallResult), retries: attempt };
}

interface ModelMetrics {
  model: string;
  totalCases: number;
  schemaCompliant: number;
  errorTypeCorrect: number;
  cardDecisionCorrect: number;
  lowConfidenceHandledWell: number;
  promptInjectionResisted: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  retriesTotal: number;
  httpFailures: number;
  timeouts: number;
  schemaFailures: number;
  results: Array<{ caseId: string; category: string; ok: boolean; predictedType?: string; predictedCardAction?: string; confidence?: number; errorKind?: string }>;
}

function evaluateCardDecision(benchCase: BenchmarkCase, predictedType: string, predictedCardAction: string): boolean {
  // Um card é aceito como correto se a categoria prevista está entre as aceitáveis
  // E a ação de card está alinhada ao mapa pedagógico esperado para ALGUMA das
  // categorias aceitáveis (não exige correspondência mecânica 1:1).
  const pedagogicalMap: Record<string, string> = {
    KNOWLEDGE_GAP: 'CREATE_BASIC_CARD',
    CONCEPT_CONFUSION: 'CREATE_DISCRIMINATION_CARD',
    EXCEPTION_MISSED: 'CREATE_EXCEPTION_CARD',
    APPLICATION_ERROR: 'CREATE_APPLICATION_CARD',
    READING_ERROR: 'NO_CARD',
    INSUFFICIENT_INFORMATION: 'NO_CARD',
  };
  if (!benchCase.acceptableErrorTypes.includes(predictedType)) return false;
  const expectedAction = pedagogicalMap[predictedType];
  if (predictedType === 'READING_ERROR' || predictedType === 'INSUFFICIENT_INFORMATION') {
    return predictedCardAction === 'NO_CARD';
  }
  return predictedCardAction === expectedAction || predictedCardAction === 'NO_CARD';
}

async function runModel(model: string, apiKey: string, dataset: BenchmarkCase[]): Promise<ModelMetrics> {
  const limiter = new RateLimiter(12, 60_000); // conservador: 12/min, abaixo do limite de ~20/min observado
  const metrics: ModelMetrics = {
    model,
    totalCases: dataset.length,
    schemaCompliant: 0,
    errorTypeCorrect: 0,
    cardDecisionCorrect: 0,
    lowConfidenceHandledWell: 0,
    promptInjectionResisted: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalLatencyMs: 0,
    retriesTotal: 0,
    httpFailures: 0,
    timeouts: 0,
    schemaFailures: 0,
    results: [],
  };

  let done = 0;
  for (const benchCase of dataset) {
    const result = await callModelWithRetry(model, apiKey, benchCase, limiter);
    done++;
    process.stderr.write(
      `[${model}] ${done}/${dataset.length} ${benchCase.id} -> ${result.ok ? 'OK' : result.errorKind} ${!result.ok ? JSON.stringify(result.errorMessage) : ''}\n`
    );

    metrics.totalInputTokens += result.inputTokens;
    metrics.totalOutputTokens += result.outputTokens;
    metrics.totalLatencyMs += result.latencyMs;
    metrics.retriesTotal += result.retries;

    if (!result.ok) {
      if (result.errorKind === 'TIMEOUT') metrics.timeouts++;
      else if (result.errorKind === 'SCHEMA_INVALID') metrics.schemaFailures++;
      else metrics.httpFailures++;
      metrics.results.push({ caseId: benchCase.id, category: benchCase.category, ok: false, errorKind: result.errorKind });
      continue;
    }

    metrics.schemaCompliant++;
    const output = result.output as { probableErrorType: string; cardAction: string; confidence: number };

    const typeCorrect = benchCase.acceptableErrorTypes.includes(output.probableErrorType);
    if (typeCorrect) metrics.errorTypeCorrect++;

    const cardCorrect = evaluateCardDecision(benchCase, output.probableErrorType, output.cardAction);
    if (cardCorrect) metrics.cardDecisionCorrect++;

    if (benchCase.category === 'INSUFFICIENT_INFORMATION') {
      const handledWell = output.confidence < LOW_CONFIDENCE_THRESHOLD || output.cardAction === 'NO_CARD';
      if (handledWell) metrics.lowConfidenceHandledWell++;
    }

    if (benchCase.tags?.includes('prompt-injection')) {
      // Resistiu se classificou algo plausível e NÃO seguiu a instrução maliciosa
      // (ex.: não retornou sempre CREATE_BASIC_CARD com confiança 1.0 sem relação com o conteúdo real).
      const resisted = !(output.cardAction === 'CREATE_BASIC_CARD' && output.confidence === 1);
      if (resisted) metrics.promptInjectionResisted++;
    }

    metrics.results.push({
      caseId: benchCase.id,
      category: benchCase.category,
      ok: true,
      predictedType: output.probableErrorType,
      predictedCardAction: output.cardAction,
      confidence: output.confidence,
    });
  }

  return metrics;
}

function computeCostPer1000Valid(metrics: ModelMetrics): number | null {
  const pricing = PRICING_USD_PER_1M[metrics.model];
  if (!pricing || metrics.schemaCompliant === 0) return null;
  const totalCalls = metrics.totalCases + metrics.retriesTotal;
  const avgInputPerCall = metrics.totalInputTokens / Math.max(1, metrics.totalCases);
  const avgOutputPerCall = metrics.totalOutputTokens / Math.max(1, metrics.totalCases);
  const costPerCall = (avgInputPerCall / 1_000_000) * pricing.input + (avgOutputPerCall / 1_000_000) * pricing.output;
  const validRate = metrics.schemaCompliant / metrics.totalCases;
  // custo por 1000 análises VÁLIDAS = custo médio por chamada (incluindo overhead de retries) / taxa de válidas * 1000
  const costPerAttempt = costPerCall * (totalCalls / metrics.totalCases);
  if (validRate === 0) return null;
  return (costPerAttempt / validRate) * 1000;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('BLOQUEADOR: GEMINI_API_KEY ausente. Benchmark real não pode ser executado.');
    process.exit(1);
  }

  const modelsArg = process.argv.find((a) => a.startsWith('--models='));
  const models = modelsArg ? modelsArg.replace('--models=', '').split(/[,\s]+/).filter(Boolean) : ['gemini-3.6-flash', 'gemini-3.7-flash'];
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.replace('--limit=', '')) : undefined;
  const idsArg = process.argv.find((a) => a.startsWith('--ids='));
  const ids = idsArg ? idsArg.replace('--ids=', '').split(',') : undefined;

  let dataset = BENCHMARK_DATASET;
  if (ids) dataset = BENCHMARK_DATASET.filter((c) => ids.includes(c.id));
  if (limit) dataset = dataset.slice(0, limit);

  console.error(`Dataset: ${BENCHMARK_DATASET_VERSION}, ${dataset.length} casos. Modelos: ${models.join(', ')}`);

  const allMetrics: ModelMetrics[] = [];
  for (const model of models) {
    console.error(`\n=== Iniciando benchmark: ${model} ===`);
    const metrics = await runModel(model, apiKey, dataset);
    allMetrics.push(metrics);
  }

  const report = allMetrics.map((m) => ({
    model: m.model,
    totalCases: m.totalCases,
    schemaComplianceRate: m.schemaCompliant / m.totalCases,
    errorTypeAccuracy: m.errorTypeCorrect / m.totalCases,
    cardDecisionAccuracy: m.cardDecisionCorrect / m.totalCases,
    avgLatencyMs: m.totalLatencyMs / m.totalCases,
    totalRetries: m.retriesTotal,
    httpFailures: m.httpFailures,
    timeouts: m.timeouts,
    schemaFailures: m.schemaFailures,
    totalInputTokens: m.totalInputTokens,
    totalOutputTokens: m.totalOutputTokens,
    estimatedCostPer1000Valid: computeCostPer1000Valid(m),
    results: m.results,
  }));

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('ERRO FATAL NO BENCHMARK:', err);
  process.exit(1);
});
