/**
 * Avaliação reproduzível de factual correctness, hallucination rate e
 * pedagogical quality (Sprint 3 — comparação final 3.6 vs 3.7).
 *
 * NÃO toca no dataset, no scorer (run-benchmark.ts) nem nos thresholds
 * congelados — apenas lê os resultados já persistidos e o julgamento manual
 * informado em scripts/benchmark/judgments/<model>.json (arquivo separado,
 * editável, versionado), aplicando exatamente a mesma rubrica fixa aos dois
 * modelos.
 *
 * Avaliador: Claude (Opus 5) — juiz independente, não é candidato do
 * benchmark (nem gemini-3.6-flash, nem gemini-3.7-flash avaliam a si
 * próprios). Mesma rubrica, mesmo avaliador, para ambos os modelos.
 *
 * Uso:
 *   npx tsx scripts/benchmark/evaluate-quality.ts benchmark-results/benchmark-v2-gemini-3.6-flash.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { BENCHMARK_DATASET, type BenchmarkCase } from './dataset';

interface CaseResult {
  caseId: string;
  category: string;
  ok: boolean;
  predictedType?: string;
  predictedCardAction?: string;
  confidence?: number;
  errorKind?: string;
}

interface ModelReport {
  model: string;
  totalCases: number;
  schemaComplianceRate: number;
  errorTypeAccuracy: number;
  createVsNoCardAccuracy?: number;
  exactCardActionAccuracy?: number;
  avgLatencyMs: number;
  p95LatencyMs?: number;
  totalRetries: number;
  httpFailures: number;
  timeouts: number;
  schemaFailures: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostPer1000Valid: number | null;
  results: CaseResult[];
}

const datasetById = new Map<string, BenchmarkCase>(BENCHMARK_DATASET.map((c) => [c.id, c]));

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: npx tsx scripts/benchmark/evaluate-quality.ts <arquivo-de-resultados.json>');
  process.exit(1);
}

const reports = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) as ModelReport[];
const report = reports[0];
if (!report) {
  console.error('Nenhum relatório encontrado no arquivo de entrada.');
  process.exit(1);
}

const eligibleForFactual = report.results.filter((r) => {
  if (!r.ok) return false;
  const benchCase = datasetById.get(r.caseId);
  if (!benchCase) return false;
  return !benchCase.tags?.includes('conflicting-explanation');
});

const eligibleForPedagogical = report.results.filter((r) => r.ok && r.predictedCardAction && r.predictedCardAction !== 'NO_CARD');

const promptInjectionCases = report.results.filter((r) => {
  const benchCase = datasetById.get(r.caseId);
  return benchCase?.tags?.includes('prompt-injection');
});

const outDir = path.resolve('benchmark-results');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const skeletonPath = path.join(outDir, `judgment-skeleton-${report.model}.json`);
fs.writeFileSync(
  skeletonPath,
  JSON.stringify(
    {
      model: report.model,
      judge: 'claude-opus-5 (juiz independente, não é candidato)',
      rubricVersion: 'quality-rubric-v1',
      factual: eligibleForFactual.map((r) => ({
        caseId: r.caseId,
        verdict: null, // 'PASS' | 'FAIL'
        note: null,
      })),
      pedagogical: eligibleForPedagogical.map((r) => ({
        caseId: r.caseId,
        atomicity: null, // 1-5
        selfContained: null,
        noMechanicalCopy: null,
        cardActionMatch: null,
        clarity: null,
        overall: null, // media ou min, definido no preenchimento
        approved: null, // true se overall >= 4
      })),
      promptInjectionCases: promptInjectionCases.map((r) => ({ caseId: r.caseId, predictedCardAction: r.predictedCardAction, confidence: r.confidence })),
    },
    null,
    2
  )
);

console.log(`Elegíveis para factual correctness: ${eligibleForFactual.length}/${report.totalCases}`);
console.log(`Elegíveis para pedagogical quality (cards gerados): ${eligibleForPedagogical.length}`);
console.log(`Casos de prompt-injection: ${promptInjectionCases.length}`);
console.log(`Esqueleto de julgamento salvo em: ${skeletonPath}`);
