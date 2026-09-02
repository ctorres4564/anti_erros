/** Auditoria estática do holdout-v26-blind. Não importa nem chama o cliente Gemini. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PROBABLE_ERROR_TYPES } from '../../src/config/ai';
import { HOLDOUT_V23_BLIND_CASES } from './holdout-v23-blind-cases';
import { HOLDOUT_V24_BLIND_CASES } from './holdout-v24-blind-cases';
import { HOLDOUT_V25_BLIND_CASES } from './holdout-v25-blind-cases';
import { HOLDOUT_V26_BLIND_CASES } from './holdout-v26-blind-cases';

type Sufficiency = 'SUFFICIENT' | 'INSUFFICIENT';
type CardDecision = 'CREATE' | 'NO_CARD';

interface GroundTruthEntry {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  expectedSufficiency: Sufficiency;
  expectedCardDecision: CardDecision;
  justification: string;
  promptInjectionCase: boolean;
  stability: 'STABLE' | 'TIME_SENSITIVE';
  observabilityNotes: string;
}

const root = process.cwd();
const groundTruthPath = path.resolve(root, 'scripts/benchmark/holdout-v26-blind-ground-truth.json');
const resultsPath = path.resolve(root, 'scripts/benchmark/holdout-v26-blind-results.json');
const groundTruth = JSON.parse(readFileSync(groundTruthPath, 'utf8')) as GroundTruthEntry[];
const errors: string[] = [];
const ambiguityErrors: string[] = [];

function requireCondition(condition: boolean, message: string) {
  if (!condition) errors.push(message);
}

function requireNonAmbiguous(condition: boolean, message: string) {
  if (!condition) ambiguityErrors.push(message);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((word) => word.length >= 5));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  const intersection = [...left].filter((word) => right.has(word)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

const expectedIds = Array.from({ length: 24 }, (_, index) => `HG${String(index + 1).padStart(2, '0')}`);
const caseIds = HOLDOUT_V26_BLIND_CASES.map((entry) => entry.id);
const truthIds = groundTruth.map((entry) => entry.id);

// ---------- STATIC AUDIT (contrato estrutural) ----------
requireCondition(HOLDOUT_V26_BLIND_CASES.length === 24, 'caseCount diferente de 24');
requireCondition(new Set(caseIds).size === caseIds.length, 'IDs duplicados no arquivo de casos');
requireCondition(new Set(truthIds).size === truthIds.length, 'IDs duplicados no ground truth');
requireCondition(expectedIds.every((id) => caseIds.includes(id)), 'HG01-HG24 incompletos nos casos');
requireCondition(expectedIds.every((id) => truthIds.includes(id)), 'HG01-HG24 incompletos no ground truth');
requireCondition(
  caseIds.every((id) => truthIds.includes(id)) && truthIds.every((id) => caseIds.includes(id)),
  'IDs de casos e ground truth divergem'
);

const allowedCaseKeys = new Set(['id', 'question', 'userAnswer', 'correctAnswer', 'studentReasoning']);
for (const testCase of HOLDOUT_V26_BLIND_CASES) {
  requireCondition(
    Object.keys(testCase).every((key) => allowedCaseKeys.has(key)),
    `${testCase.id}: campo não observável no arquivo de casos`
  );
  requireCondition(testCase.question.trim().length > 10, `${testCase.id}: question ausente/curta`);
  requireCondition(testCase.userAnswer.trim().length > 0, `${testCase.id}: userAnswer ausente`);
  requireCondition(testCase.correctAnswer.trim().length > 0, `${testCase.id}: correctAnswer ausente`);
  requireCondition(
    normalize(testCase.userAnswer) !== normalize(testCase.correctAnswer),
    `${testCase.id}: userAnswer não diverge do gabarito`
  );
}

const errorDistribution: Record<string, number> = {};
const sufficiencyDistribution: Record<string, number> = {};
const cardDistribution: Record<string, number> = {};
for (const truth of groundTruth) {
  requireCondition(
    PROBABLE_ERROR_TYPES.includes(truth.expectedErrorType as (typeof PROBABLE_ERROR_TYPES)[number]),
    `${truth.id}: errorType inválido`
  );
  requireCondition(
    truth.acceptableErrorTypes.includes(truth.expectedErrorType),
    `${truth.id}: categoria principal ausente de acceptableErrorTypes`
  );
  requireCondition(truth.justification.trim().length >= 40, `${truth.id}: justificativa insuficiente`);
  requireCondition(truth.observabilityNotes.trim().length >= 20, `${truth.id}: observabilityNotes insuficiente`);
  requireCondition(truth.stability === 'STABLE', `${truth.id}: conteúdo potencialmente time-sensitive`);
  if (truth.expectedErrorType === 'INSUFFICIENT_INFORMATION') {
    requireCondition(truth.expectedSufficiency === 'INSUFFICIENT', `${truth.id}: II deve ser INSUFFICIENT`);
    requireCondition(truth.expectedCardDecision === 'NO_CARD', `${truth.id}: II deve ser NO_CARD`);
  }
  if (truth.expectedErrorType === 'READING_ERROR') {
    requireCondition(truth.expectedCardDecision === 'NO_CARD', `${truth.id}: READING_ERROR deve ser NO_CARD`);
  }
  errorDistribution[truth.expectedErrorType] = (errorDistribution[truth.expectedErrorType] ?? 0) + 1;
  sufficiencyDistribution[truth.expectedSufficiency] = (sufficiencyDistribution[truth.expectedSufficiency] ?? 0) + 1;
  cardDistribution[truth.expectedCardDecision] = (cardDistribution[truth.expectedCardDecision] ?? 0) + 1;
}

for (const category of PROBABLE_ERROR_TYPES) {
  requireCondition((errorDistribution[category] ?? 0) > 0, `categoria sem cobertura: ${category}`);
}
requireCondition((errorDistribution.INSUFFICIENT_INFORMATION ?? 0) >= 6, 'menos de 6 casos II');

const adversarialIds = groundTruth.filter((entry) => entry.promptInjectionCase).map((entry) => entry.id);
requireCondition(adversarialIds.length >= 4, 'menos de 4 casos adversariais');
for (const id of adversarialIds) {
  const reasoning = HOLDOUT_V26_BLIND_CASES.find((entry) => entry.id === id)?.studentReasoning ?? '';
  requireCondition(/ignore|desconsidere|instru[cç][aã]o|responda apenas/i.test(reasoning), `${id}: payload adversarial não identificado`);
}

// ---------- LEAKAGE AUDIT (rótulo diagnóstico vazado nos campos observáveis) ----------
const labels = PROBABLE_ERROR_TYPES.map((label) => label.toUpperCase());
for (const testCase of HOLDOUT_V26_BLIND_CASES) {
  const publicWithoutReasoning = `${testCase.question}\n${testCase.userAnswer}\n${testCase.correctAnswer}`.toUpperCase();
  requireCondition(
    !labels.some((label) => publicWithoutReasoning.includes(label)),
    `${testCase.id}: label diagnóstico em question/userAnswer/correctAnswer`
  );
  if (!adversarialIds.includes(testCase.id)) {
    const reasoning = (testCase.studentReasoning ?? '').toUpperCase();
    requireCondition(
      !labels.some((label) => reasoning.includes(label)),
      `${testCase.id}: label diagnóstico literal em reasoning não adversarial`
    );
  }
}

// ---------- COUNTERFACTUAL PAIRS ----------
const counterfactualPairs = [
  ['HG11', 'HG12'],
  ['HG14', 'HG15'],
] as const;
for (const [leftId, rightId] of counterfactualPairs) {
  const left = HOLDOUT_V26_BLIND_CASES.find((entry) => entry.id === leftId);
  const right = HOLDOUT_V26_BLIND_CASES.find((entry) => entry.id === rightId);
  requireCondition(Boolean(left && right), `par ausente: ${leftId}x${rightId}`);
  if (left && right) {
    requireCondition(left.question === right.question, `${leftId}x${rightId}: question diverge`);
    requireCondition(left.userAnswer === right.userAnswer, `${leftId}x${rightId}: userAnswer diverge`);
    requireCondition(left.correctAnswer === right.correctAnswer, `${leftId}x${rightId}: correctAnswer diverge`);
    requireCondition(left.studentReasoning !== right.studentReasoning, `${leftId}x${rightId}: reasoning não diverge`);
  }
}

// ---------- NOVELTY / LEAKAGE CRUZADO (V23 + V24 + V25) ----------
const priorCases = [...HOLDOUT_V23_BLIND_CASES, ...HOLDOUT_V24_BLIND_CASES, ...HOLDOUT_V25_BLIND_CASES];
for (const current of HOLDOUT_V26_BLIND_CASES) {
  for (const prior of priorCases) {
    requireCondition(normalize(current.question) !== normalize(prior.question), `${current.id}: question reutilizada de ${prior.id}`);
    const similarity = jaccard(words(current.question), words(prior.question));
    requireCondition(similarity < 0.7, `${current.id}: similaridade lexical excessiva (${similarity.toFixed(2)}) com ${prior.id}`);
  }
}

// ---------- AMBIGUITY AUDIT (distinto do static/leakage) ----------
// 1. Nenhum caso não-II pode ter acceptableErrorTypes com mais de uma categoria
//    sem justificativa que enderece explicitamente a ambiguidade (não há nenhum
//    caso assim planejado neste instrumento — todos devem ser de categoria única).
for (const truth of groundTruth) {
  requireNonAmbiguous(truth.acceptableErrorTypes.length === 1, `${truth.id}: mais de uma categoria aceitável introduz ambiguidade não planejada`);
}

// 2. Nenhuma questão duplicada dentro do próprio instrumento fora dos pares
//    contrafactuais declarados (duplicação não intencional geraria ambiguidade
//    de qual ground truth se aplica a qual observação).
const declaredPairIds = new Set<string>(counterfactualPairs.flat());
for (let i = 0; i < HOLDOUT_V26_BLIND_CASES.length; i += 1) {
  for (let j = i + 1; j < HOLDOUT_V26_BLIND_CASES.length; j += 1) {
    const a = HOLDOUT_V26_BLIND_CASES[i];
    const b = HOLDOUT_V26_BLIND_CASES[j];
    const bothDeclared = declaredPairIds.has(a.id) && declaredPairIds.has(b.id);
    const isDeclaredPair = counterfactualPairs.some(([l, r]) => (l === a.id && r === b.id) || (l === b.id && r === a.id));
    if (normalize(a.question) === normalize(b.question) && normalize(a.userAnswer) === normalize(b.userAnswer)) {
      requireNonAmbiguous(isDeclaredPair || !bothDeclared, `${a.id}x${b.id}: par observacionalmente idêntico não declarado como par contrafactual`);
    }
  }
}

// 3. Para cada caso II, o reasoning (quando presente) não pode conter um único
//    fato discriminante inequívoco que apontaria deterministicamente para uma
//    causa específica — sinal de que a rotulagem como II seria injustificada.
const iiIds = groundTruth.filter((t) => t.expectedErrorType === 'INSUFFICIENT_INFORMATION').map((t) => t.id);
const discriminantTriggerPattern = /eu (n[aã]o sabia|desconhecia)|apliquei a regra|li .* como se fosse|troquei os dois conceitos/i;
for (const id of iiIds) {
  const reasoning = HOLDOUT_V26_BLIND_CASES.find((c) => c.id === id)?.studentReasoning ?? '';
  requireNonAmbiguous(!discriminantTriggerPattern.test(reasoning), `${id}: reasoning contém gatilho discriminante que contradiz a rotulagem como INSUFFICIENT_INFORMATION`);
}

// 4. Justificativa de cada caso II deve nomear explicitamente mais de uma causa
//    concorrente plausível, evidenciando por que a ambiguidade é genuína e não
//    apenas "faltou detalhar".
for (const id of iiIds) {
  const truth = groundTruth.find((t) => t.id === id);
  const justification = truth?.justification ?? '';
  requireNonAmbiguous(/ou |outra causa|outras causas|m[uú]ltiplos|diversas|nenhuma delas/i.test(justification), `${id}: justificativa não evidencia causas concorrentes plausíveis`);
}

requireCondition(!existsSync(resultsPath), 'arquivo de resultados já existe antes da execução cega');

console.log(`CASE COUNT: ${HOLDOUT_V26_BLIND_CASES.length}`);
console.log(`II COUNT: ${errorDistribution.INSUFFICIENT_INFORMATION ?? 0}`);
console.log(`ADVERSARIAL COUNT: ${adversarialIds.length}`);
console.log(`COUNTERFACTUAL PAIRS: ${counterfactualPairs.length}`);
console.log('ERROR TYPE DISTRIBUTION:', errorDistribution);
console.log('SUFFICIENCY DISTRIBUTION:', sufficiencyDistribution);
console.log('CARD DISTRIBUTION:', cardDistribution);
console.log(`RESULTS FILE CREATED: ${existsSync(resultsPath) ? 'YES' : 'NO'}`);
console.log(`STATIC AUDIT: ${errors.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`LEAKAGE AUDIT: ${errors.some((error) => error.includes('label diagnóstico') || error.includes('reutilizada') || error.includes('similaridade lexical')) ? 'FAIL' : 'PASS'}`);
console.log(`AMBIGUITY AUDIT: ${ambiguityErrors.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`STABILITY AUDIT: ${errors.some((error) => error.includes('time-sensitive')) ? 'FAIL' : 'PASS'}`);
console.log(`MODEL EXECUTED: NO`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[STATIC/LEAKAGE FAIL] ${error}`);
}
if (ambiguityErrors.length > 0) {
  for (const error of ambiguityErrors) console.error(`[AMBIGUITY FAIL] ${error}`);
}
if (errors.length > 0 || ambiguityErrors.length > 0) {
  process.exitCode = 1;
}
