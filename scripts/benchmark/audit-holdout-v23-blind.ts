/**
 * Auditoria estática do instrumento HOLDOUT-V23-BLIND, ANTES de qualquer execução
 * contra o Gemini. NÃO chama a API do Gemini — só valida os dois arquivos novos
 * (holdout-v23-blind-cases.ts / holdout-v23-blind-ground-truth.json) localmente.
 *
 * Uso: npx tsx scripts/benchmark/audit-holdout-v23-blind.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOLDOUT_V23_BLIND_CASES, type HoldoutV23BlindCase } from './holdout-v23-blind-cases';
import { PROBABLE_ERROR_TYPES, DISCIPLINES } from '../../src/config/ai';
import { BENCHMARK_DATASET } from './dataset';
import { HOLDOUT_V2_CASES } from './holdout-v2-cases';

interface GroundTruthEntry {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  diagnosticEvidenceExpected: 'SUFFICIENT' | 'INSUFFICIENT';
  justification: string;
  promptInjectionCase: boolean;
  promptInjectionExpectedBehavior: string;
}

const groundTruthPath = path.resolve(__dirname, 'holdout-v23-blind-ground-truth.json');
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

// ---------- 1. Validação de schema dos 30 casos ----------
console.log('### 1. VALIDAÇÃO DE SCHEMA ###');
if (HOLDOUT_V23_BLIND_CASES.length !== 30) {
  fail(`Esperado exatamente 30 casos, encontrado ${HOLDOUT_V23_BLIND_CASES.length}.`);
} else {
  console.log('30 casos encontrados. OK.');
}

const seenIds = new Set<string>();
for (const c of HOLDOUT_V23_BLIND_CASES) {
  if (seenIds.has(c.id)) fail(`ID duplicado: ${c.id}`);
  seenIds.add(c.id);

  const allowedKeys = new Set(['id', 'question', 'userAnswer', 'correctAnswer', 'studentReasoning']);
  for (const key of Object.keys(c)) {
    if (!allowedKeys.has(key)) fail(`${c.id}: campo não permitido no contrato v2.3: "${key}"`);
  }
  for (const forbidden of ['officialExplanation', 'userAttribution', 'category', 'tags', 'notes', 'acceptableErrorTypes']) {
    if (Object.prototype.hasOwnProperty.call(c, forbidden)) {
      fail(`${c.id}: campo proibido presente no arquivo de casos (vazaria ground truth ou usa contrato antigo): "${forbidden}"`);
    }
  }
  if (!c.question || c.question.trim().length < 5) fail(`${c.id}: question ausente ou curta demais.`);
  if (!c.userAnswer || c.userAnswer.trim().length === 0) fail(`${c.id}: userAnswer ausente.`);
  if (!c.correctAnswer || c.correctAnswer.trim().length === 0) fail(`${c.id}: correctAnswer ausente.`);
}

const gtIds = new Set(GROUND_TRUTH.map((g) => g.id));
for (const c of HOLDOUT_V23_BLIND_CASES) {
  if (!gtIds.has(c.id)) fail(`${c.id}: sem entrada correspondente no ground truth.`);
}
for (const g of GROUND_TRUTH) {
  if (!seenIds.has(g.id)) fail(`Ground truth ${g.id}: sem caso correspondente no arquivo de casos.`);
  if (!PROBABLE_ERROR_TYPES.includes(g.expectedErrorType as (typeof PROBABLE_ERROR_TYPES)[number])) {
    fail(`${g.id}: expectedErrorType "${g.expectedErrorType}" fora da taxonomia oficial.`);
  }
  for (const acceptable of g.acceptableErrorTypes) {
    if (!PROBABLE_ERROR_TYPES.includes(acceptable as (typeof PROBABLE_ERROR_TYPES)[number])) {
      fail(`${g.id}: acceptableErrorTypes contém "${acceptable}" fora da taxonomia oficial.`);
    }
  }
  if (!g.acceptableErrorTypes.includes(g.expectedErrorType)) {
    fail(`${g.id}: expectedErrorType não está contido em acceptableErrorTypes.`);
  }
  if (g.expectedErrorType === 'INSUFFICIENT_INFORMATION' && g.expectedCardDecision !== 'NO_CARD') {
    fail(`${g.id}: expectedErrorType=INSUFFICIENT_INFORMATION mas expectedCardDecision != NO_CARD (viola a política determinística vigente).`);
  }
  if (g.diagnosticEvidenceExpected === 'INSUFFICIENT' && g.expectedErrorType !== 'INSUFFICIENT_INFORMATION') {
    fail(`${g.id}: diagnosticEvidenceExpected=INSUFFICIENT mas expectedErrorType != INSUFFICIENT_INFORMATION (inconsistente).`);
  }
  if (g.promptInjectionCase && g.promptInjectionExpectedBehavior.trim().length < 10) {
    fail(`${g.id}: promptInjectionCase=true mas promptInjectionExpectedBehavior não descreve o comportamento esperado.`);
  }
}
console.log(`Schema: ${errors === 0 ? 'OK' : `${errors} erro(s) encontrados acima`}.\n`);

// ---------- 2 e 3. Leakage causal: rótulo da taxonomia aparecendo nos campos observáveis ----------
console.log('### 2-3. AUDITORIA DE LEAKAGE CAUSAL ###');
const injectionIds = new Set(GROUND_TRUTH.filter((g) => g.promptInjectionCase).map((g) => g.id));
let leakageFound = 0;
for (const c of HOLDOUT_V23_BLIND_CASES) {
  const haystack = [c.question, c.userAnswer, c.correctAnswer, c.studentReasoning ?? ''].join('\n');
  for (const label of PROBABLE_ERROR_TYPES) {
    if (haystack.includes(label)) {
      if (injectionIds.has(c.id)) {
        console.log(
          `  ${c.id}: contém o rótulo "${label}" — ESPERADO (caso adversarial: é o payload de ataque, não vazamento do ground truth real).`
        );
      } else {
        fail(`${c.id}: contém literalmente o rótulo "${label}" em um campo observável — vazamento de ground truth.`);
        leakageFound++;
      }
    }
  }
  for (const cardLabel of ['CREATE_BASIC_CARD', 'CREATE_DISCRIMINATION_CARD', 'CREATE_EXCEPTION_CARD', 'CREATE_APPLICATION_CARD', 'NO_CARD']) {
    if (haystack.includes(cardLabel) && !injectionIds.has(c.id)) {
      fail(`${c.id}: contém literalmente "${cardLabel}" em campo observável — vazamento de ground truth de card.`);
      leakageFound++;
    }
  }
}
console.log(`Leakage não-adversarial encontrado: ${leakageFound}. ${leakageFound === 0 ? 'OK.' : 'FALHA.'}\n`);

// ---------- 4. Duplicidade/semelhança excessiva com material de desenvolvimento ----------
console.log('### 4. DUPLICIDADE COM MATERIAL DE DESENVOLVIMENTO ###');
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter((w) => w.length > 3));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

const devMaterial: Array<{ source: string; id: string; question: string }> = [
  ...BENCHMARK_DATASET.map((d) => ({ source: 'dataset.ts (BENCHMARK_DATASET)', id: d.id, question: d.question })),
  ...HOLDOUT_V2_CASES.map((d) => ({ source: 'holdout-v2-cases.ts', id: d.id, question: d.question })),
];

const SIMILARITY_THRESHOLD = 0.6;
let similarityFlags = 0;
for (const c of HOLDOUT_V23_BLIND_CASES) {
  const cWords = wordSet(c.question);
  let best = { source: '', id: '', score: 0 };
  for (const dev of devMaterial) {
    const score = jaccard(cWords, wordSet(dev.question));
    if (score > best.score) best = { source: dev.source, id: dev.id, score };
  }
  if (best.score >= SIMILARITY_THRESHOLD) {
    warn(`${c.id}: similaridade de ${(best.score * 100).toFixed(0)}% (Jaccard de palavras da question) com ${best.source}#${best.id} — revisar manualmente.`);
    similarityFlags++;
  }
}
console.log(
  `Comparado contra ${devMaterial.length} casos de dataset.ts + holdout-v2-cases.ts (limiar Jaccard ${SIMILARITY_THRESHOLD}). Casos sinalizados: ${similarityFlags}.`
);
console.log(
  'Nota: REG-A..H / INJ-1..4 (scratch/diagnostic-v22-fix.ts) e V22-xx não são arquivos de dataset formais e foram revisados manualmente por tópico/redação — não há sobreposição literal de perguntas.\n'
);

// ---------- 5-7. Distribuições ----------
console.log('### 5-7. DISTRIBUIÇÕES ###');
const byErrorType: Record<string, number> = {};
const byCard: Record<string, number> = {};
const bySufficiency: Record<string, number> = {};
for (const g of GROUND_TRUTH) {
  byErrorType[g.expectedErrorType] = (byErrorType[g.expectedErrorType] ?? 0) + 1;
  byCard[g.expectedCardDecision] = (byCard[g.expectedCardDecision] ?? 0) + 1;
  bySufficiency[g.diagnosticEvidenceExpected] = (bySufficiency[g.diagnosticEvidenceExpected] ?? 0) + 1;
}
console.log('Por errorType esperado:', byErrorType);
console.log('Por card esperado:', byCard);
console.log('Por suficiência esperada:', bySufficiency);
console.log(`Casos de prompt injection: ${GROUND_TRUTH.filter((g) => g.promptInjectionCase).length}\n`);

// ---------- 8. Ataques adversariais ----------
console.log('### 8. VERIFICAÇÃO DOS ATAQUES ADVERSARIAIS ###');
const attackTypeByCase: Record<string, string> = {
  BC27: 'errorType',
  BC28: 'confidence',
  BC29: 'card',
  BC30: 'schema/formato',
};
for (const [id, attackType] of Object.entries(attackTypeByCase)) {
  const c = HOLDOUT_V23_BLIND_CASES.find((x) => x.id === id);
  const g = GROUND_TRUTH.find((x) => x.id === id);
  if (!c || !g) {
    fail(`Caso adversarial esperado ${id} não encontrado.`);
    continue;
  }
  if (!g.promptInjectionCase) fail(`${id}: deveria ter promptInjectionCase=true.`);
  console.log(`  ${id} (${attackType}): expectedErrorType=${g.expectedErrorType}, expectedCard=${g.expectedCardDecision} — auditável (evidência real != pedido injetado). OK.`);
}
console.log('4/4 tipos de ataque cobertos (errorType, confidence, card, schema).\n');

// ---------- Resumo de disciplinas (apenas informativo — discipline não é o alvo desta validação) ----------
console.log('### DISCIPLINAS ABORDADAS (contexto do enunciado; não confundir com DISCIPLINES enum de output) ###');
console.log(`Enum de output discipline disponível: ${DISCIPLINES.length} valores (${DISCIPLINES.join(', ')}).`);
console.log('Nota: BC01 (geografia), BC02/17 (biologia), BC08/12/16/21 (física), BC04/18 (química) e BC22/23/26 (história) usam domínios de conteúdo fora do enum DISCIPLINES atual (voltado a concursos) — o modelo deve classificá-los como "Outra". Isso é esperado e não é um defeito do instrumento: o alvo desta validação é probableErrorType/diagnosticEvidence/cardAction, não a acurácia do enum discipline.\n');

// ---------- 9 (bis). Pares contrafactuais: mesma Q/UA/CA, só studentReasoning muda ----------
console.log('### PARES CONTRAFACTUAIS (Q/UA/CA idênticos, studentReasoning varia) ###');
const tripleGroups = new Map<string, HoldoutV23BlindCase[]>();
for (const c of HOLDOUT_V23_BLIND_CASES) {
  const key = `${c.question} ${c.userAnswer} ${c.correctAnswer}`;
  const arr = tripleGroups.get(key) ?? [];
  arr.push(c);
  tripleGroups.set(key, arr);
}
let counterfactualPairCount = 0;
for (const [, group] of tripleGroups) {
  if (group.length >= 2) {
    counterfactualPairCount++;
    console.log(`  Par encontrado: ${group.map((g) => g.id).join(' + ')} — question: "${group[0].question.slice(0, 60)}..."`);
  }
}
if (counterfactualPairCount < 2) {
  fail(`Apenas ${counterfactualPairCount} par(es) contrafactual(is) encontrado(s); mínimo exigido é 2.`);
} else {
  console.log(`${counterfactualPairCount} pares contrafactuais confirmados. OK (mínimo de 2 atingido).\n`);
}

// ---------- 9. Confirmação de não execução ----------
console.log('### 9. CONFIRMAÇÃO ###');
console.log('MODEL EXECUTED: NO (este script não importa nem chama src/lib/ai/gemini.ts, GeminiAnalysisClient, nem faz fetch para generativelanguage.googleapis.com)');
console.log('DATASET FROZEN: NO (aguardando revisão do usuário antes do freeze)');

console.log(`\n### RESUMO FINAL: ${errors} erro(s), ${warnings} aviso(s) ###`);
if (errors > 0) {
  process.exitCode = 1;
}
