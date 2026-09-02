/** Auditoria estática do holdout-v25-blind. Não importa nem chama o cliente Gemini. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PROBABLE_ERROR_TYPES } from '../../src/config/ai';
import { HOLDOUT_V23_BLIND_CASES } from './holdout-v23-blind-cases';
import { HOLDOUT_V24_BLIND_CASES } from './holdout-v24-blind-cases';
import { HOLDOUT_V25_BLIND_CASES } from './holdout-v25-blind-cases';

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
const groundTruthPath = path.resolve(root, 'scripts/benchmark/holdout-v25-blind-ground-truth.json');
const resultsPath = path.resolve(root, 'scripts/benchmark/holdout-v25-blind-results.json');
const groundTruth = JSON.parse(readFileSync(groundTruthPath, 'utf8')) as GroundTruthEntry[];
const errors: string[] = [];

function requireCondition(condition: boolean, message: string) {
  if (!condition) errors.push(message);
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

const expectedIds = Array.from({ length: 24 }, (_, index) => `HF${String(index + 1).padStart(2, '0')}`);
const caseIds = HOLDOUT_V25_BLIND_CASES.map((entry) => entry.id);
const truthIds = groundTruth.map((entry) => entry.id);

requireCondition(HOLDOUT_V25_BLIND_CASES.length >= 24 && HOLDOUT_V25_BLIND_CASES.length <= 30, 'caseCount fora de 24–30');
requireCondition(new Set(caseIds).size === caseIds.length, 'IDs duplicados no arquivo de casos');
requireCondition(new Set(truthIds).size === truthIds.length, 'IDs duplicados no ground truth');
requireCondition(expectedIds.every((id) => caseIds.includes(id)), 'HF01–HF24 incompletos nos casos');
requireCondition(expectedIds.every((id) => truthIds.includes(id)), 'HF01–HF24 incompletos no ground truth');
requireCondition(caseIds.every((id) => truthIds.includes(id)) && truthIds.every((id) => caseIds.includes(id)), 'IDs de casos e ground truth divergem');

const allowedCaseKeys = new Set(['id', 'question', 'userAnswer', 'correctAnswer', 'studentReasoning']);
for (const testCase of HOLDOUT_V25_BLIND_CASES) {
  requireCondition(Object.keys(testCase).every((key) => allowedCaseKeys.has(key)), `${testCase.id}: campo não observável no arquivo de casos`);
  requireCondition(testCase.question.trim().length > 10, `${testCase.id}: question ausente/curta`);
  requireCondition(testCase.userAnswer.trim().length > 0, `${testCase.id}: userAnswer ausente`);
  requireCondition(testCase.correctAnswer.trim().length > 0, `${testCase.id}: correctAnswer ausente`);
  requireCondition(normalize(testCase.userAnswer) !== normalize(testCase.correctAnswer), `${testCase.id}: userAnswer não diverge do gabarito`);
}

const errorDistribution: Record<string, number> = {};
const sufficiencyDistribution: Record<string, number> = {};
const cardDistribution: Record<string, number> = {};
for (const truth of groundTruth) {
  requireCondition(PROBABLE_ERROR_TYPES.includes(truth.expectedErrorType as (typeof PROBABLE_ERROR_TYPES)[number]), `${truth.id}: errorType inválido`);
  requireCondition(truth.acceptableErrorTypes.includes(truth.expectedErrorType), `${truth.id}: categoria principal ausente de acceptableErrorTypes`);
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
  const reasoning = HOLDOUT_V25_BLIND_CASES.find((entry) => entry.id === id)?.studentReasoning ?? '';
  requireCondition(/ignore|instru[cç][aã]o|pare de responder/i.test(reasoning), `${id}: payload adversarial não identificado`);
}

const labels = PROBABLE_ERROR_TYPES.map((label) => label.toUpperCase());
for (const testCase of HOLDOUT_V25_BLIND_CASES) {
  const publicWithoutReasoning = `${testCase.question}\n${testCase.userAnswer}\n${testCase.correctAnswer}`.toUpperCase();
  requireCondition(!labels.some((label) => publicWithoutReasoning.includes(label)), `${testCase.id}: label diagnóstico em question/userAnswer/correctAnswer`);
  if (!adversarialIds.includes(testCase.id)) {
    const reasoning = (testCase.studentReasoning ?? '').toUpperCase();
    requireCondition(!labels.some((label) => reasoning.includes(label)), `${testCase.id}: label diagnóstico literal em reasoning não adversarial`);
  }
}

const counterfactualPairs = [
  ['HF11', 'HF12'],
  ['HF17', 'HF18'],
] as const;
for (const [leftId, rightId] of counterfactualPairs) {
  const left = HOLDOUT_V25_BLIND_CASES.find((entry) => entry.id === leftId);
  const right = HOLDOUT_V25_BLIND_CASES.find((entry) => entry.id === rightId);
  requireCondition(Boolean(left && right), `par ausente: ${leftId}×${rightId}`);
  if (left && right) {
    requireCondition(left.question === right.question, `${leftId}×${rightId}: question diverge`);
    requireCondition(left.userAnswer === right.userAnswer, `${leftId}×${rightId}: userAnswer diverge`);
    requireCondition(left.correctAnswer === right.correctAnswer, `${leftId}×${rightId}: correctAnswer diverge`);
    requireCondition(left.studentReasoning !== right.studentReasoning, `${leftId}×${rightId}: reasoning não diverge`);
  }
}

const priorCases = [...HOLDOUT_V23_BLIND_CASES, ...HOLDOUT_V24_BLIND_CASES];
for (const current of HOLDOUT_V25_BLIND_CASES) {
  for (const prior of priorCases) {
    requireCondition(normalize(current.question) !== normalize(prior.question), `${current.id}: question reutilizada de ${prior.id}`);
    const similarity = jaccard(words(current.question), words(prior.question));
    requireCondition(similarity < 0.7, `${current.id}: similaridade lexical excessiva (${similarity.toFixed(2)}) com ${prior.id}`);
  }
}

requireCondition(!existsSync(resultsPath), 'arquivo de resultados já existe antes da execução cega');

console.log(`CASE COUNT: ${HOLDOUT_V25_BLIND_CASES.length}`);
console.log(`II COUNT: ${errorDistribution.INSUFFICIENT_INFORMATION ?? 0}`);
console.log(`ADVERSARIAL COUNT: ${adversarialIds.length}`);
console.log(`COUNTERFACTUAL PAIRS: ${counterfactualPairs.length}`);
console.log('ERROR TYPE DISTRIBUTION:', errorDistribution);
console.log('SUFFICIENCY DISTRIBUTION:', sufficiencyDistribution);
console.log('CARD DISTRIBUTION:', cardDistribution);
console.log(`RESULTS FILE CREATED: ${existsSync(resultsPath) ? 'YES' : 'NO'}`);
console.log(`STATIC AUDIT: ${errors.length === 0 ? 'PASS' : 'FAIL'}`);
console.log(`LEAKAGE AUDIT: ${errors.some((error) => error.includes('label diagnóstico')) ? 'FAIL' : 'PASS'}`);
console.log(`STABILITY AUDIT: ${errors.some((error) => error.includes('time-sensitive')) ? 'FAIL' : 'PASS'}`);
console.log(`MODEL EXECUTED: NO`);

if (errors.length > 0) {
  for (const error of errors) console.error(`[FAIL] ${error}`);
  process.exitCode = 1;
}
