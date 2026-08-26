/**
 * Compara os resultados congelados de dois modelos (benchmark-v2) e aplica
 * a regra de seleção oficial. Não altera dataset, scorer ou thresholds —
 * apenas lê os arquivos de resultado + julgamentos e produz a tabela final.
 *
 * Uso:
 *   npx tsx scripts/benchmark/compare-models.ts \
 *     benchmark-results/benchmark-v2-gemini-3.6-flash.json \
 *     benchmark-results/benchmark-v2-gemini-3.7-flash.json \
 *     benchmark-results/judgment-gemini-3.6-flash.json \
 *     benchmark-results/judgment-gemini-3.7-flash.json
 */
import fs from 'node:fs';

const THRESHOLDS = {
  schemaCompliance: 1.0,
  factualCorrectness: 0.98,
  hallucinationRate: 0.01, // <=
  createVsNoCard: 0.95,
  errorClassification: 0.9,
  pedagogicalQuality: 0.92,
  uncertaintyHandling: 0.95,
};

interface CaseResult {
  caseId: string;
  ok: boolean;
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
  uncertaintyHandling?: { correct: number; denominator: number };
  promptInjectionResistance?: { resisted: number; denominator: number };
  results: CaseResult[];
}

interface JudgmentFile {
  model: string;
  factual: Array<{ caseId: string; verdict: 'PASS' | 'FAIL' | null; note: string | null; hallucination?: boolean }>;
  pedagogical: Array<{ caseId: string; overall: number | null; approved: boolean | null }>;
}

function loadReport(path: string): ModelReport {
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return Array.isArray(data) ? data[0] : data;
}

function loadJudgment(path: string): JudgmentFile {
  return JSON.parse(fs.readFileSync(path, 'utf-8'));
}

function computeFactual(judgment: JudgmentFile) {
  const evaluated = judgment.factual.filter((j) => j.verdict !== null);
  const pass = evaluated.filter((j) => j.verdict === 'PASS').length;
  return { rate: evaluated.length ? pass / evaluated.length : null, num: pass, den: evaluated.length };
}

function computeHallucination(judgment: JudgmentFile) {
  const evaluated = judgment.factual.filter((j) => j.verdict !== null);
  const hallucinated = evaluated.filter((j) => j.hallucination === true).length;
  return { rate: evaluated.length ? hallucinated / evaluated.length : null, num: hallucinated, den: evaluated.length };
}

function computePedagogical(judgment: JudgmentFile) {
  const evaluated = judgment.pedagogical.filter((j) => j.approved !== null);
  const approved = evaluated.filter((j) => j.approved === true).length;
  return { rate: evaluated.length ? approved / evaluated.length : null, num: approved, den: evaluated.length };
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return (n * 100).toFixed(2) + '%';
}

function passFail(value: number | null | undefined, threshold: number, direction: 'gte' | 'lte' = 'gte') {
  if (value === null || value === undefined || Number.isNaN(value)) return 'PENDENTE';
  return direction === 'gte' ? (value >= threshold ? 'PASS' : 'FAIL') : value <= threshold ? 'PASS' : 'FAIL';
}

const [reportPathA, reportPathB, judgmentPathA, judgmentPathB] = process.argv.slice(2);
if (!reportPathA || !reportPathB) {
  console.error('Uso: compare-models.ts <report-A.json> <report-B.json> [judgment-A.json] [judgment-B.json]');
  process.exit(1);
}

const reportA = loadReport(reportPathA);
const reportB = loadReport(reportPathB);
const judgmentA: JudgmentFile | null = judgmentPathA && fs.existsSync(judgmentPathA) ? loadJudgment(judgmentPathA) : null;
const judgmentB: JudgmentFile | null = judgmentPathB && fs.existsSync(judgmentPathB) ? loadJudgment(judgmentPathB) : null;

function summarize(report: ModelReport, judgment: JudgmentFile | null) {
  const factual = judgment ? computeFactual(judgment) : { rate: null, num: 0, den: 0 };
  const hallucination = judgment ? computeHallucination(judgment) : { rate: null, num: 0, den: 0 };
  const pedagogical = judgment ? computePedagogical(judgment) : { rate: null, num: 0, den: 0 };

  return {
    model: report.model,
    totalCases: report.totalCases,
    schemaComplianceRate: report.schemaComplianceRate,
    errorTypeAccuracy: report.errorTypeAccuracy,
    createVsNoCardAccuracy: report.createVsNoCardAccuracy ?? null,
    exactCardActionAccuracy: report.exactCardActionAccuracy ?? null,
    uncertaintyHandlingRate: report.uncertaintyHandling
      ? report.uncertaintyHandling.denominator > 0
        ? report.uncertaintyHandling.correct / report.uncertaintyHandling.denominator
        : null
      : null,
    promptInjectionResistanceRate: report.promptInjectionResistance
      ? report.promptInjectionResistance.denominator > 0
        ? report.promptInjectionResistance.resisted / report.promptInjectionResistance.denominator
        : null
      : null,
    factual,
    hallucination,
    pedagogical,
    avgLatencyMs: report.avgLatencyMs,
    p95LatencyMs: report.p95LatencyMs ?? null,
    totalRetries: report.totalRetries,
    httpFailures: report.httpFailures,
    timeouts: report.timeouts,
    schemaFailures: report.schemaFailures,
    estimatedCostPer1000Valid: report.estimatedCostPer1000Valid,
  };
}

const summaryA = summarize(reportA, judgmentA);
const summaryB = summarize(reportB, judgmentB);

function evaluateThresholds(s: ReturnType<typeof summarize>) {
  return {
    schema: passFail(s.schemaComplianceRate, THRESHOLDS.schemaCompliance),
    classification: passFail(s.errorTypeAccuracy, THRESHOLDS.errorClassification),
    createVsNoCard: passFail(s.createVsNoCardAccuracy, THRESHOLDS.createVsNoCard),
    uncertaintyHandling: passFail(s.uncertaintyHandlingRate, THRESHOLDS.uncertaintyHandling),
    factual: passFail(s.factual.rate, THRESHOLDS.factualCorrectness),
    hallucination: passFail(s.hallucination.rate, THRESHOLDS.hallucinationRate, 'lte'),
    pedagogical: passFail(s.pedagogical.rate, THRESHOLDS.pedagogicalQuality),
  };
}

const verdictA = evaluateThresholds(summaryA);
const verdictB = evaluateThresholds(summaryB);

function allMandatoryPass(v: ReturnType<typeof evaluateThresholds>) {
  return Object.values(v).every((x) => x === 'PASS');
}

console.log(JSON.stringify({ summaryA, verdictA, summaryB, verdictB, thresholds: THRESHOLDS }, null, 2));

const aPasses = allMandatoryPass(verdictA);
const bPasses = allMandatoryPass(verdictB);

let selected: string | null = null;
if (aPasses && bPasses) {
  selected =
    (summaryA.estimatedCostPer1000Valid ?? Infinity) <= (summaryB.estimatedCostPer1000Valid ?? Infinity)
      ? summaryA.model
      : summaryB.model;
} else if (aPasses) {
  selected = summaryA.model;
} else if (bPasses) {
  selected = summaryB.model;
}

console.log('\nMODELO SELECIONADO:', selected ?? 'NENHUM (nenhum modelo passou em todos os thresholds obrigatórios)');
