/**
 * Constrói a matriz de erros cruzando os 4 candidatos já avaliados contra
 * benchmark-v2 (dev set). NÃO altera dataset nem scorer — apenas lê os
 * resultados já persistidos e agrega por caso, para permitir análise
 * qualitativa de causa-raiz (Sprint 3, rodada de refinamento pós-freeze).
 *
 * Uso: npx tsx scripts/benchmark/error-matrix.ts
 */
import fs from 'node:fs';
import { BENCHMARK_DATASET, type BenchmarkCase } from './dataset';

const CANDIDATES = [
  { label: '3.6-flash', path: 'benchmark-results/benchmark-v2-gemini-3.6-flash.json' },
  { label: '3.7-flash-medium', path: 'benchmark-results/benchmark-v2-gemini-3.7-flash.json' },
  { label: '3.7-flash-high', path: 'benchmark-results/benchmark-v2-gemini-3.7-flash-high.json' },
  { label: '3.1-pro-preview', path: 'benchmark-results/benchmark-v2-gemini-3.1-pro-preview.json' },
];

function loadResults(p: string) {
  const raw = fs.readFileSync(p, 'utf-8');
  const cleaned = raw.startsWith('◇') ? raw.slice(raw.indexOf('\n') + 1) : raw;
  const data = JSON.parse(cleaned);
  const report = Array.isArray(data) ? data[0] : data;
  return report.results as Array<{
    caseId: string;
    ok: boolean;
    predictedType?: string;
    predictedCardAction?: string;
    confidence?: number;
    rawOutput?: any;
  }>;
}

const byCandidate = CANDIDATES.map((c) => ({ label: c.label, results: new Map(loadResults(c.path).map((r) => [r.caseId, r])) }));

const byId = new Map(BENCHMARK_DATASET.map((c) => [c.id, c]));

function isNoCardExpected(bc: BenchmarkCase) {
  return bc.category === 'READING_ERROR' || bc.category === 'INSUFFICIENT_INFORMATION';
}
function acceptsCard(bc: BenchmarkCase) {
  return bc.acceptableErrorTypes.some((t) => t !== 'READING_ERROR' && t !== 'INSUFFICIENT_INFORMATION');
}
function acceptsNoCard(bc: BenchmarkCase) {
  return bc.acceptableErrorTypes.some((t) => t === 'READING_ERROR' || t === 'INSUFFICIENT_INFORMATION');
}
function cardOk(bc: BenchmarkCase, predictedCardAction: string) {
  const predictedIsNoCard = predictedCardAction === 'NO_CARD';
  if (predictedIsNoCard) return isNoCardExpected(bc) || acceptsNoCard(bc);
  return !isNoCardExpected(bc) || acceptsCard(bc);
}

interface Row {
  caseId: string;
  category: string;
  acceptableErrorTypes: string[];
  perModel: Array<{ label: string; ok: boolean; predictedType?: string; predictedCardAction?: string; confidence?: number; typeCorrect: boolean; cardCorrect: boolean }>;
  typeWrongCount: number;
  cardWrongCount: number;
}

const rows: Row[] = [];
for (const bc of BENCHMARK_DATASET) {
  const perModel = byCandidate.map(({ label, results }) => {
    const r = results.get(bc.id);
    if (!r || !r.ok || !r.predictedType || !r.predictedCardAction) {
      return { label, ok: false, typeCorrect: false, cardCorrect: false };
    }
    const typeCorrect = bc.acceptableErrorTypes.includes(r.predictedType);
    const cardCorrect = cardOk(bc, r.predictedCardAction);
    return { label, ok: true, predictedType: r.predictedType, predictedCardAction: r.predictedCardAction, confidence: r.confidence, typeCorrect, cardCorrect };
  });
  const typeWrongCount = perModel.filter((m) => m.ok && !m.typeCorrect).length;
  const cardWrongCount = perModel.filter((m) => m.ok && !m.cardCorrect).length;
  rows.push({ caseId: bc.id, category: bc.category, acceptableErrorTypes: bc.acceptableErrorTypes, perModel, typeWrongCount, cardWrongCount });
}

// Confusion matrix (systematic: count how many (model,case) pairs went category X -> predicted Y)
const CATEGORIES = ['KNOWLEDGE_GAP', 'CONCEPT_CONFUSION', 'EXCEPTION_MISSED', 'APPLICATION_ERROR', 'READING_ERROR', 'INSUFFICIENT_INFORMATION'];
const confusion: Record<string, Record<string, number>> = {};
for (const c of CATEGORIES) confusion[c] = Object.fromEntries(CATEGORIES.map((c2) => [c2, 0]));

for (const row of rows) {
  for (const m of row.perModel) {
    if (!m.ok || !m.predictedType) continue;
    if (!CATEGORIES.includes(row.category) || !CATEGORIES.includes(m.predictedType)) continue;
    confusion[row.category][m.predictedType]++;
  }
}

console.log('=== CONFUSION MATRIX (linhas=esperado, colunas=previsto; soma de 4 modelos x N casos) ===');
console.log('expected\\predicted\t' + CATEGORIES.map((c) => c.slice(0, 6)).join('\t'));
for (const c of CATEGORIES) {
  console.log(c.padEnd(24) + '\t' + CATEGORIES.map((c2) => confusion[c][c2]).join('\t'));
}

console.log('\n=== CASOS COM ERRO DE CLASSIFICACAO SISTEMICO (>=3/4 modelos erraram o tipo) ===');
const systematicTypeErrors = rows.filter((r) => r.typeWrongCount >= 3);
console.log(`Total: ${systematicTypeErrors.length}`);
for (const r of systematicTypeErrors) {
  const bc = byId.get(r.caseId)!;
  console.log(`\n--- ${r.caseId} [${r.category}] accept=${JSON.stringify(r.acceptableErrorTypes)}`);
  console.log(`Q: ${bc.question}`);
  console.log(`userAnswer: ${bc.userAnswer} | correctAnswer: ${bc.correctAnswer}`);
  if (bc.officialExplanation) console.log(`officialExplanation: ${bc.officialExplanation}`);
  for (const m of r.perModel) {
    console.log(`  ${m.label}: ${m.ok ? `type=${m.predictedType}(${m.typeCorrect ? 'OK' : 'WRONG'}) card=${m.predictedCardAction}(${m.cardCorrect ? 'OK' : 'WRONG'}) conf=${m.confidence}` : 'FAIL'}`);
  }
}

console.log('\n=== CASOS COM ERRO DE CARD SISTEMICO (>=3/4 modelos erraram CREATE/NO_CARD) ===');
const systematicCardErrors = rows.filter((r) => r.cardWrongCount >= 3);
console.log(`Total: ${systematicCardErrors.length}`);
for (const r of systematicCardErrors) {
  const bc = byId.get(r.caseId)!;
  console.log(`\n--- ${r.caseId} [${r.category}] accept=${JSON.stringify(r.acceptableErrorTypes)}`);
  console.log(`Q: ${bc.question}`);
  console.log(`userAnswer: ${bc.userAnswer} | correctAnswer: ${bc.correctAnswer}`);
  for (const m of r.perModel) {
    console.log(`  ${m.label}: ${m.ok ? `type=${m.predictedType}(${m.typeCorrect ? 'OK' : 'WRONG'}) card=${m.predictedCardAction}(${m.cardCorrect ? 'OK' : 'WRONG'}) conf=${m.confidence}` : 'FAIL'}`);
  }
}

console.log('\n=== RESUMO ===');
console.log('Casos com >=1 modelo errando tipo:', rows.filter((r) => r.typeWrongCount >= 1).length);
console.log('Casos com >=1 modelo errando card:', rows.filter((r) => r.cardWrongCount >= 1).length);
console.log('Casos com erro sistemico de tipo (>=3/4):', systematicTypeErrors.length);
console.log('Casos com erro sistemico de card (>=3/4):', systematicCardErrors.length);

fs.writeFileSync(
  'benchmark-results/error-matrix.json',
  JSON.stringify({ confusion, rows }, null, 2)
);
console.log('\nMatriz completa salva em benchmark-results/error-matrix.json');
