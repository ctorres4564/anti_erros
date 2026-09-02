/**
 * Auditoria estática do instrumento HOLDOUT-V24-BLIND, ANTES de qualquer execução
 * contra o Gemini/analysis-v2.4. NÃO chama a API do Gemini — só valida os dois
 * arquivos novos (holdout-v24-blind-cases.ts / holdout-v24-blind-ground-truth.json)
 * localmente, e audita similaridade contra o material de desenvolvimento anterior.
 *
 * Uso: npx tsx scripts/benchmark/audit-holdout-v24-blind.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOLDOUT_V24_BLIND_CASES, type HoldoutV24BlindCase } from './holdout-v24-blind-cases';
import { HOLDOUT_V23_BLIND_CASES } from './holdout-v23-blind-cases';
import { PROBABLE_ERROR_TYPES, DISCIPLINES } from '../../src/config/ai';
import { BENCHMARK_DATASET } from './dataset';
import { HOLDOUT_V2_CASES } from './holdout-v2-cases';

interface GroundTruthEntry {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  expectedSufficiency: 'SUFFICIENT' | 'INSUFFICIENT';
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  justification: string;
  promptInjectionCase: boolean;
  stability: 'STABLE' | 'TIME_SENSITIVE';
  observabilityNotes: string;
}

const groundTruthPath = path.resolve(__dirname, 'holdout-v24-blind-ground-truth.json');
const GROUND_TRUTH: GroundTruthEntry[] = JSON.parse(readFileSync(groundTruthPath, 'utf-8'));

let errors = 0;
let warnings = 0;
function fail(msg: string) {
  console.error(`[ERRO] ${msg}`);
  errors++;
}
function warn(msg: string) {
  console.warn(`[AVISO] ${msg}`);
  warnings++;
}

// ---------- 1. Schema dos casos ----------
console.log('### 1. VALIDAÇÃO DE SCHEMA ###');
if (HOLDOUT_V24_BLIND_CASES.length < 36 || HOLDOUT_V24_BLIND_CASES.length > 40) {
  fail(`Esperado entre 36 e 40 casos, encontrado ${HOLDOUT_V24_BLIND_CASES.length}.`);
} else {
  console.log(`${HOLDOUT_V24_BLIND_CASES.length} casos encontrados (dentro de 36-40). OK.`);
}

const seenIds = new Set<string>();
for (const c of HOLDOUT_V24_BLIND_CASES) {
  if (seenIds.has(c.id)) fail(`ID duplicado: ${c.id}`);
  seenIds.add(c.id);
  const allowedKeys = new Set(['id', 'question', 'userAnswer', 'correctAnswer', 'studentReasoning']);
  for (const key of Object.keys(c)) {
    if (!allowedKeys.has(key)) fail(`${c.id}: campo não permitido: "${key}"`);
  }
  for (const forbidden of ['officialExplanation', 'userAttribution', 'expectedErrorType', 'justification', 'observability', 'expectedCardDecision']) {
    if (Object.prototype.hasOwnProperty.call(c, forbidden)) {
      fail(`${c.id}: campo de ground truth vazou para o arquivo de casos: "${forbidden}"`);
    }
  }
  if (!c.question || c.question.trim().length < 5) fail(`${c.id}: question ausente ou curta demais.`);
  if (!c.userAnswer) fail(`${c.id}: userAnswer ausente.`);
  if (!c.correctAnswer) fail(`${c.id}: correctAnswer ausente.`);
}

const gtIds = new Set(GROUND_TRUTH.map((g) => g.id));
for (const c of HOLDOUT_V24_BLIND_CASES) {
  if (!gtIds.has(c.id)) fail(`${c.id}: sem entrada correspondente no ground truth.`);
}
for (const g of GROUND_TRUTH) {
  if (!seenIds.has(g.id)) fail(`Ground truth ${g.id}: sem caso correspondente.`);
  if (!PROBABLE_ERROR_TYPES.includes(g.expectedErrorType as (typeof PROBABLE_ERROR_TYPES)[number])) {
    fail(`${g.id}: expectedErrorType "${g.expectedErrorType}" fora da taxonomia.`);
  }
  if (!g.acceptableErrorTypes.includes(g.expectedErrorType)) {
    fail(`${g.id}: expectedErrorType não está em acceptableErrorTypes.`);
  }
  if (g.expectedErrorType === 'INSUFFICIENT_INFORMATION' && g.expectedCardDecision !== 'NO_CARD') {
    fail(`${g.id}: II mas expectedCardDecision != NO_CARD.`);
  }
  if (g.expectedSufficiency === 'INSUFFICIENT' && g.expectedErrorType !== 'INSUFFICIENT_INFORMATION') {
    fail(`${g.id}: expectedSufficiency=INSUFFICIENT mas expectedErrorType != INSUFFICIENT_INFORMATION.`);
  }
  if (g.stability !== 'STABLE') {
    warn(`${g.id}: marcado como ${g.stability}, não STABLE.`);
  }
}
console.log(`Schema: ${errors === 0 ? 'OK' : 'erros acima'}.\n`);

// ---------- 2-3. Leakage causal ----------
console.log('### 2-3. AUDITORIA DE LEAKAGE CAUSAL ###');
const injectionIds = new Set(GROUND_TRUTH.filter((g) => g.promptInjectionCase).map((g) => g.id));
const leakPhrases = ['o aluno confundiu', 'o aluno não sabia', 'aplicou errado', 'ignorou a exceção', 'o estudante confundiu', 'o estudante não sabia'];
let leakageFound = 0;
for (const c of HOLDOUT_V24_BLIND_CASES) {
  const haystack = [c.question, c.userAnswer, c.correctAnswer].join('\n').toLowerCase();
  for (const phrase of leakPhrases) {
    if (haystack.includes(phrase)) {
      fail(`${c.id}: question/userAnswer/correctAnswer contém formulação diagnóstica ("${phrase}") — vazamento de ground truth.`);
      leakageFound++;
    }
  }
  for (const label of PROBABLE_ERROR_TYPES) {
    const fullHaystack = [c.question, c.userAnswer, c.correctAnswer, c.studentReasoning ?? ''].join('\n');
    if (fullHaystack.includes(label)) {
      if (injectionIds.has(c.id)) {
        console.log(`  ${c.id}: contém "${label}" — ESPERADO (payload adversarial, não vazamento real).`);
      } else {
        fail(`${c.id}: contém literalmente o rótulo "${label}" — vazamento de ground truth.`);
        leakageFound++;
      }
    }
  }
}
console.log(`Leakage não-adversarial encontrado: ${leakageFound}. ${leakageFound === 0 ? 'OK.' : 'FALHA.'}\n`);

// ---------- 4-5-6-7. Distribuições ----------
console.log('### 4-7. DISTRIBUIÇÕES ###');
const byErrorType: Record<string, number> = {};
const bySuff: Record<string, number> = {};
const byCard: Record<string, number> = {};
for (const g of GROUND_TRUTH) {
  byErrorType[g.expectedErrorType] = (byErrorType[g.expectedErrorType] ?? 0) + 1;
  bySuff[g.expectedSufficiency] = (bySuff[g.expectedSufficiency] ?? 0) + 1;
  byCard[g.expectedCardDecision] = (byCard[g.expectedCardDecision] ?? 0) + 1;
}
console.log('Por errorType:', byErrorType);
console.log('Por sufficiency:', bySuff);
console.log('Por card:', byCard);
console.log(`INSUFFICIENT_INFORMATION: ${byErrorType['INSUFFICIENT_INFORMATION'] ?? 0} casos.`);
console.log(`Prompt injection: ${GROUND_TRUTH.filter((g) => g.promptInjectionCase).length} casos.\n`);

// ---------- 8. Pares contrafactuais ----------
console.log('### 8. PARES CONTRAFACTUAIS ###');
const tripleGroups = new Map<string, HoldoutV24BlindCase[]>();
for (const c of HOLDOUT_V24_BLIND_CASES) {
  const key = `${c.question} ${c.userAnswer} ${c.correctAnswer}`;
  const arr = tripleGroups.get(key) ?? [];
  arr.push(c);
  tripleGroups.set(key, arr);
}
let pairCount = 0;
for (const [, group] of tripleGroups) {
  if (group.length >= 2) {
    pairCount++;
    console.log(`  Par: ${group.map((g) => g.id).join(' + ')} — "${group[0].question.slice(0, 60)}..."`);
  }
}
if (pairCount < 3) {
  fail(`Apenas ${pairCount} par(es) contrafactual(is); mínimo exigido é 3.`);
} else {
  console.log(`${pairCount} pares confirmados. OK.\n`);
}

// ---------- 9. Ataques adversariais ----------
console.log('### 9. VERIFICAÇÃO DOS ATAQUES ###');
const attackList = GROUND_TRUTH.filter((g) => g.promptInjectionCase);
if (attackList.length < 4 || attackList.length > 6) {
  warn(`${attackList.length} casos de injection (esperado entre 4 e 6).`);
}
for (const g of attackList) {
  console.log(`  ${g.id}: expectedErrorType=${g.expectedErrorType}, card=${g.expectedCardDecision}`);
}
console.log('');

// ---------- 10-11. Similaridade com material anterior ----------
console.log('### 10-11. SIMILARIDADE COM DATASETS ANTERIORES ###');
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((w) => w.length > 4)); // >4 para evitar "calcule"/"assinale" etc.
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}
const devMaterial: Array<{ source: string; id: string; question: string }> = [
  ...BENCHMARK_DATASET.map((d) => ({ source: 'dataset.ts', id: d.id, question: d.question })),
  ...HOLDOUT_V2_CASES.map((d) => ({ source: 'holdout-v2-cases.ts', id: d.id, question: d.question })),
  ...HOLDOUT_V23_BLIND_CASES.map((d) => ({ source: 'holdout-v23-blind-cases.ts', id: d.id, question: d.question })),
];
const SIMILARITY_THRESHOLD = 0.5;
let similarityFlags = 0;
for (const c of HOLDOUT_V24_BLIND_CASES) {
  const cWords = wordSet(c.question);
  let best = { source: '', id: '', score: 0 };
  for (const dev of devMaterial) {
    const score = jaccard(cWords, wordSet(dev.question));
    if (score > best.score) best = { source: dev.source, id: dev.id, score };
  }
  if (best.score >= SIMILARITY_THRESHOLD) {
    warn(`${c.id}: similaridade de ${(best.score * 100).toFixed(0)}% com ${best.source}#${best.id} — revisar manualmente.`);
    similarityFlags++;
  }
}
console.log(`Comparado contra ${devMaterial.length} casos (dataset.ts + holdout-v2 + holdout-v23-blind). Sinalizados: ${similarityFlags}.`);
console.log('Nota: REG-A..H/INJ-1..4 (scratch/) e V22-xx não existem como dataset formal — revisados manualmente por tópico; nenhuma sobreposição literal identificada.\n');

// ---------- Disciplinas (informativo) ----------
console.log('### DISCIPLINAS (contexto do enunciado) ###');
console.log(`Enum de output discipline: ${DISCIPLINES.length} valores.`);
console.log('Vários casos usam domínios fora do enum atual (Física, Química, Biologia, Geografia, História, Estatística) — classificarão como "Outra"; não é o alvo desta validação.\n');

// ---------- Confirmação final ----------
console.log('### CONFIRMAÇÃO ###');
console.log('MODEL EXECUTED: NO (este script não importa nem chama src/lib/ai/gemini.ts, GeminiAnalysisClient, nem faz fetch)');
console.log('DATASET FROZEN: NO (primeira proposta de ground truth de um único agente — requer dupla anotação e adjudicação)');

console.log(`\n### RESUMO FINAL: ${errors} erro(s), ${warnings} aviso(s) ###`);
if (errors > 0) process.exitCode = 1;
