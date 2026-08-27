/**
 * Diagnóstico (NÃO validação) de analysis-v2.1 contra holdout-v1.
 *
 * holdout-v1 não é mais holdout cego (docs/SPRINT_3_FINAL_HOLDOUT_EVALUATION.md)
 * e seu ground truth de INSUFFICIENT_INFORMATION tem MAJOR CONSTRUCT MISMATCH
 * documentado (docs/SPRINT_3_INSUFFICIENT_INFORMATION_CONSTRUCT_AUDIT.md).
 * Este script NÃO produz um "score oficial corrigido" — apenas o score bruto
 * original (rotulado explicitamente como inválido para validação) e slices
 * informativos por classe de constructo, para diagnóstico apenas.
 *
 * Não altera ground truth, não altera labels, não recalcula acceptableErrorTypes.
 *
 * Uso: npx tsx scripts/benchmark/diagnose-holdout-v2.1.ts
 */
import fs from 'node:fs';
import groundTruthRaw from './holdout-v1-ground-truth.json';

const LOW_CONFIDENCE_THRESHOLD = 0.6;

interface GroundTruthCase {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  observability: string;
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  promptInjectionCase: boolean;
}

const groundTruth = groundTruthRaw as GroundTruthCase[];
const gtById = new Map(groundTruth.map((c) => [c.id, c]));

// Classificação da auditoria de constructo (docs/SPRINT_3_INSUFFICIENT_INFORMATION_CONSTRUCT_AUDIT.md §3-4).
// Não é ground truth novo — é rótulo de diagnóstico do INSTRUMENTO, não do caso.
const VALID_DIAGNOSTIC_INSUFFICIENCY = new Set(['H060', 'H090']);
const ANSWER_INDETERMINACY_ONLY = new Set([
  'H006', 'H026', 'H039', 'H040', 'H047', 'H064', 'H065', 'H068', 'H072', 'H075', 'H080', 'H094', 'H095', 'H102', 'H112', 'H117', 'H120',
]);
const AMBIGUOUS_CONSTRUCT = new Set(['H004']);

const report = JSON.parse(fs.readFileSync('benchmark-results/holdout-v1-analysis-v2.1-gemini-3.7-flash.json', 'utf-8'));

interface ResultCase {
  caseId: string;
  ok: boolean;
  predictedType?: string;
  predictedCardAction?: string;
  confidence?: number;
}

const results = report.results as ResultCase[];

function scoreSlice(ids: Set<string> | null) {
  const subset = ids ? results.filter((r) => ids.has(r.caseId)) : results;
  let exact = 0;
  let acceptable = 0;
  let cardCorrect = 0;
  for (const r of subset) {
    const gt = gtById.get(r.caseId)!;
    if (!r.ok) continue;
    if (r.predictedType === gt.expectedErrorType) exact++;
    if (r.predictedType === gt.expectedErrorType || gt.acceptableErrorTypes.includes(r.predictedType!)) acceptable++;
    const predictedBinary = r.predictedCardAction === 'NO_CARD' ? 'NO_CARD' : 'CREATE';
    if (predictedBinary === gt.expectedCardDecision) cardCorrect++;
  }
  return {
    n: subset.length,
    exactRate: subset.length ? exact / subset.length : null,
    acceptableRate: subset.length ? acceptable / subset.length : null,
    cardRate: subset.length ? cardCorrect / subset.length : null,
  };
}

// Raw global score — INVALID FOR VALIDATION, diagnostic only.
const schemaCompliant = results.filter((r) => r.ok).length;
const insufficientCases = results.filter((r) => gtById.get(r.caseId)!.expectedErrorType === 'INSUFFICIENT_INFORMATION');
let uncertaintyHandledWell = 0;
for (const r of insufficientCases) {
  if (!r.ok) continue;
  const handledWell = (r.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD || r.predictedCardAction === 'NO_CARD';
  if (handledWell) uncertaintyHandledWell++;
}

const global = scoreSlice(null);

const injectionIds = new Set(groundTruth.filter((c) => c.promptInjectionCase).map((c) => c.id));
const injectionCreateIds = new Set(groundTruth.filter((c) => c.promptInjectionCase && c.expectedCardDecision === 'CREATE').map((c) => c.id));
const injectionNoCardIds = new Set(groundTruth.filter((c) => c.promptInjectionCase && c.expectedCardDecision === 'NO_CARD').map((c) => c.id));

const output = {
  label: 'INVALID FOR VALIDATION / DIAGNOSTIC ONLY (holdout-v1 ground truth has documented II construct mismatch)',
  raw: {
    schemaComplianceRate: schemaCompliant / results.length,
    classificationExact: global.exactRate,
    classificationAcceptable: global.acceptableRate,
    createVsNoCard: global.cardRate,
    uncertaintyHandling: { correct: uncertaintyHandledWell, denominator: insufficientCases.length, rate: insufficientCases.length ? uncertaintyHandledWell / insufficientCases.length : null },
  },
  slices: {
    VALID_DIAGNOSTIC_INSUFFICIENCY: scoreSlice(VALID_DIAGNOSTIC_INSUFFICIENCY),
    ANSWER_INDETERMINACY_ONLY: scoreSlice(ANSWER_INDETERMINACY_ONLY),
    AMBIGUOUS_CONSTRUCT: scoreSlice(AMBIGUOUS_CONSTRUCT),
    promptInjection_all: scoreSlice(injectionIds),
    promptInjection_expectCREATE: scoreSlice(injectionCreateIds),
    promptInjection_expectNOCARD: scoreSlice(injectionNoCardIds),
  },
};

fs.writeFileSync('benchmark-results/holdout-v1-analysis-v2.1-diagnostics.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
