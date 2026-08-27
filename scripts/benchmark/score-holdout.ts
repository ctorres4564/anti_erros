/**
 * Scorer determinístico da avaliação final cega do holdout-v1. Não decide
 * factual correctness / hallucination / pedagogical quality / prompt
 * injection robustness (isso exige julgamento humano/independente, feito à
 * parte e combinado depois) — calcula apenas as métricas mecânicas: schema
 * compliance, classification (exact + acceptable), CREATE vs NO_CARD,
 * uncertainty handling, matriz de confusão, e quebras por categoria/
 * observability.
 *
 * Uso: npx tsx scripts/benchmark/score-holdout.ts
 */
import fs from 'node:fs';
import groundTruthRaw from './holdout-v1-ground-truth.json';

const LOW_CONFIDENCE_THRESHOLD = 0.6;

interface GroundTruthCase {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  observability: 'CLEAR' | 'AMBIGUOUS' | 'UNOBSERVABLE';
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  justification: string;
  promptInjectionCase: boolean;
  promptInjectionExpectedBehavior: string;
}

const groundTruth = groundTruthRaw as GroundTruthCase[];
const gtById = new Map(groundTruth.map((c) => [c.id, c]));

const report = JSON.parse(fs.readFileSync('benchmark-results/holdout-v1-analysis-v2-gemini-3.7-flash.json', 'utf-8'));

interface ResultCase {
  caseId: string;
  ok: boolean;
  predictedType?: string;
  predictedCardAction?: string;
  confidence?: number;
  errorKind?: string;
  rawOutput?: any;
}

const results = report.results as ResultCase[];

const CATEGORIES = ['KNOWLEDGE_GAP', 'CONCEPT_CONFUSION', 'EXCEPTION_MISSED', 'APPLICATION_ERROR', 'READING_ERROR', 'INSUFFICIENT_INFORMATION'];

// A. Schema compliance
const schemaCompliant = results.filter((r) => r.ok).length;
const schemaComplianceRate = schemaCompliant / results.length;

// B. Classification
let exactMatches = 0;
let acceptableMatches = 0;
const confusion: Record<string, Record<string, number>> = {};
for (const c of CATEGORIES) confusion[c] = Object.fromEntries(CATEGORIES.map((c2) => [c2, 0]));

const byCategory: Record<string, { total: number; exact: number; acceptable: number }> = {};
for (const c of CATEGORIES) byCategory[c] = { total: 0, exact: 0, acceptable: 0 };

const byObservability: Record<string, { total: number; acceptable: number }> = {
  CLEAR: { total: 0, acceptable: 0 },
  AMBIGUOUS: { total: 0, acceptable: 0 },
  UNOBSERVABLE: { total: 0, acceptable: 0 },
};

const classificationErrors: Array<{ id: string; expected: string; acceptable: string[]; predicted: string | undefined; observability: string }> = [];

for (const r of results) {
  const gt = gtById.get(r.caseId)!;
  byCategory[gt.expectedErrorType].total++;
  byObservability[gt.observability].total++;

  if (!r.ok || !r.predictedType) {
    classificationErrors.push({ id: r.caseId, expected: gt.expectedErrorType, acceptable: gt.acceptableErrorTypes, predicted: undefined, observability: gt.observability });
    continue;
  }

  if (CATEGORIES.includes(gt.expectedErrorType) && CATEGORIES.includes(r.predictedType)) {
    confusion[gt.expectedErrorType][r.predictedType]++;
  }

  const isExact = r.predictedType === gt.expectedErrorType;
  const isAcceptable = isExact || gt.acceptableErrorTypes.includes(r.predictedType);

  if (isExact) {
    exactMatches++;
    byCategory[gt.expectedErrorType].exact++;
  }
  if (isAcceptable) {
    acceptableMatches++;
    byCategory[gt.expectedErrorType].acceptable++;
    byObservability[gt.observability].acceptable++;
  } else {
    classificationErrors.push({ id: r.caseId, expected: gt.expectedErrorType, acceptable: gt.acceptableErrorTypes, predicted: r.predictedType, observability: gt.observability });
  }
}

// C. CREATE vs NO_CARD
let cardCorrect = 0;
const cardErrors: Array<{ id: string; expectedCardDecision: string; predictedCardAction: string | undefined }> = [];
for (const r of results) {
  const gt = gtById.get(r.caseId)!;
  if (!r.ok || !r.predictedCardAction) {
    cardErrors.push({ id: r.caseId, expectedCardDecision: gt.expectedCardDecision, predictedCardAction: undefined });
    continue;
  }
  const predictedBinary = r.predictedCardAction === 'NO_CARD' ? 'NO_CARD' : 'CREATE';
  if (predictedBinary === gt.expectedCardDecision) {
    cardCorrect++;
  } else {
    cardErrors.push({ id: r.caseId, expectedCardDecision: gt.expectedCardDecision, predictedCardAction: r.predictedCardAction });
  }
}

// D. Uncertainty handling — mesma metodologia de run-benchmark.ts: entre os
// casos cujo ground truth é INSUFFICIENT_INFORMATION, contar "handled well"
// se confidence < threshold OU cardAction === NO_CARD.
const insufficientCases = results.filter((r) => gtById.get(r.caseId)!.expectedErrorType === 'INSUFFICIENT_INFORMATION');
let uncertaintyHandledWell = 0;
for (const r of insufficientCases) {
  if (!r.ok) continue;
  const handledWell = (r.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD || r.predictedCardAction === 'NO_CARD';
  if (handledWell) uncertaintyHandledWell++;
}

// Prompt injection cases (technical only — behavior audit done separately by judge)
const injectionCases = groundTruth.filter((c) => c.promptInjectionCase).map((c) => c.id);

const output = {
  totalCases: results.length,
  schemaCompliant,
  schemaComplianceRate,
  classification: {
    exactMatches,
    exactRate: exactMatches / results.length,
    acceptableMatches,
    acceptableRate: acceptableMatches / results.length,
  },
  cardDecision: {
    correct: cardCorrect,
    rate: cardCorrect / results.length,
  },
  uncertaintyHandling: {
    correct: uncertaintyHandledWell,
    denominator: insufficientCases.length,
    rate: insufficientCases.length ? uncertaintyHandledWell / insufficientCases.length : null,
  },
  confusionMatrix: confusion,
  byCategory: Object.fromEntries(
    Object.entries(byCategory).map(([k, v]) => [k, { ...v, exactRate: v.total ? v.exact / v.total : null, acceptableRate: v.total ? v.acceptable / v.total : null }])
  ),
  byObservability: Object.fromEntries(Object.entries(byObservability).map(([k, v]) => [k, { ...v, acceptableRate: v.total ? v.acceptable / v.total : null }])),
  classificationErrors,
  cardErrors,
  injectionCaseIds: injectionCases,
  technical: {
    httpFailures: report.httpFailures,
    timeouts: report.timeouts,
    schemaFailures: report.schemaFailures,
    totalRetries: report.totalRetries,
    avgLatencyMs: report.avgLatencyMs,
    p95LatencyMs: report.p95LatencyMs,
  },
};

fs.writeFileSync('benchmark-results/holdout-v1-scoring.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
