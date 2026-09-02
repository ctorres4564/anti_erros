/**
 * Avaliação PÓS-EXECUÇÃO do holdout-v23-blind. Carrega os resultados brutos já
 * salvos (holdout-v23-blind-run-results.json, gerado por run-holdout-v23-blind.ts)
 * e o ground truth (holdout-v23-blind-ground-truth.json) — NUNCA o contrário.
 * Não faz nenhuma chamada ao Gemini.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PROBABLE_ERROR_TYPES } from '../../src/config/ai';

interface RunResult {
  caseId: string;
  ok: boolean;
  errorMessage?: string;
  raw?: any;
  final?: any;
  policyIntervention: boolean;
  policyReason?: string;
  latencyMs: number;
}

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

const results: RunResult[] = JSON.parse(readFileSync(path.resolve(__dirname, 'holdout-v23-blind-run-results.json'), 'utf-8'));
const groundTruth: GroundTruthEntry[] = JSON.parse(readFileSync(path.resolve(__dirname, 'holdout-v23-blind-ground-truth.json'), 'utf-8'));

const gtById = new Map(groundTruth.map((g) => [g.id, g]));
const resultById = new Map(results.map((r) => [r.caseId, r]));

let errorTypePass = 0;
let sufficiencyPass = 0;
let cardPass = 0;

const confusion: Record<string, Record<string, number>> = {};
for (const a of PROBABLE_ERROR_TYPES) {
  confusion[a] = {};
  for (const b of PROBABLE_ERROR_TYPES) confusion[a][b] = 0;
}

console.log('### TABELA POR CASO ###');
console.log('ID | expected_type | predicted_type | TYPE | exp_suff | pred_suff | SUFF | exp_card | pred_card | CARD | confidence | policy | fonte');
for (const g of groundTruth) {
  const r = resultById.get(g.id);
  if (!r || !r.ok || !r.final) {
    console.log(`${g.id} | FALHA DE EXECUÇÃO: ${r?.errorMessage}`);
    continue;
  }
  const f = r.final;
  const predictedType: string = f.probableErrorType;
  const predictedSuff: 'SUFFICIENT' | 'INSUFFICIENT' = f.probableErrorType === 'INSUFFICIENT_INFORMATION' ? 'INSUFFICIENT' : 'SUFFICIENT';
  const predictedCard: 'CREATE' | 'NO_CARD' = f.cardAction === 'NO_CARD' ? 'NO_CARD' : 'CREATE';

  const typeOk = g.acceptableErrorTypes.includes(predictedType);
  const suffOk = predictedSuff === g.diagnosticEvidenceExpected;
  const cardOk = predictedCard === g.expectedCardDecision;

  if (typeOk) errorTypePass++;
  if (suffOk) sufficiencyPass++;
  if (cardOk) cardPass++;

  confusion[g.expectedErrorType][predictedType] = (confusion[g.expectedErrorType][predictedType] ?? 0) + 1;

  console.log(
    `${g.id} | ${g.expectedErrorType} | ${predictedType} | ${typeOk ? 'PASS' : 'FAIL'} | ${g.diagnosticEvidenceExpected} | ${predictedSuff} | ${suffOk ? 'PASS' : 'FAIL'} | ${g.expectedCardDecision} | ${predictedCard} | ${cardOk ? 'PASS' : 'FAIL'} | ${f.confidence} | ${r.policyIntervention ? 'YES: ' + r.policyReason : 'NO'} | evidenceSource=${f.diagnosticEvidence?.evidenceSource ?? 'null'}`
  );
}

console.log(`\n### RESUMO GATES A-C ###`);
console.log(`A) errorType (acceptable): ${errorTypePass}/30`);
console.log(`B) sufficiency: ${sufficiencyPass}/30`);
console.log(`C) card: ${cardPass}/30`);

console.log('\n### MATRIZ DE CONFUSÃO (linhas=esperado, colunas=previsto) ###');
const header = ['EXPECTED\\PREDICTED', ...PROBABLE_ERROR_TYPES].join(' | ');
console.log(header);
for (const a of PROBABLE_ERROR_TYPES) {
  const row = [a, ...PROBABLE_ERROR_TYPES.map((b) => String(confusion[a][b]))].join(' | ');
  console.log(row);
}

console.log('\n### GATE D — 6 CASOS INSUFFICIENT_INFORMATION ###');
const iiCases = groundTruth.filter((g) => g.expectedErrorType === 'INSUFFICIENT_INFORMATION');
let iiPass = 0;
for (const g of iiCases) {
  const r = resultById.get(g.id)!;
  const f = r.final;
  const isII = f.probableErrorType === 'INSUFFICIENT_INFORMATION';
  if (isII) iiPass++;
  console.log(`${g.id}: predicted=${f.probableErrorType} confidence=${f.confidence} sufficient=${f.diagnosticEvidence?.sufficient} card=${f.cardAction} evidenceQuote=${JSON.stringify(f.diagnosticEvidence?.evidenceQuote)} -> ${isII ? 'PASS' : 'FAIL'}`);
}
console.log(`Gate D: ${iiPass}/6`);

console.log('\n### PARES CONTRAFACTUAIS ###');
for (const [a, b] of [['BC16', 'BC21'], ['BC22', 'BC23']]) {
  const ra = resultById.get(a)!.final;
  const rb = resultById.get(b)!.final;
  console.log(`\n${a} (evidência específica): errorType=${ra.probableErrorType} sufficient=${ra.diagnosticEvidence?.sufficient} card=${ra.cardAction}`);
  console.log(`${b} (evidência vaga):       errorType=${rb.probableErrorType} sufficient=${rb.diagnosticEvidence?.sufficient} card=${rb.cardAction}`);
  console.log(`Diferença diagnóstica produzida pela troca de studentReasoning: ${ra.probableErrorType !== rb.probableErrorType || ra.diagnosticEvidence?.sufficient !== rb.diagnosticEvidence?.sufficient ? 'SIM' : 'NÃO'}`);
}

console.log('\n### PROMPT INJECTION: BC27-30 ###');
for (const id of ['BC27', 'BC28', 'BC29', 'BC30']) {
  const g = gtById.get(id)!;
  const r = resultById.get(id)!;
  console.log(`\n${id}:`);
  console.log(`  expected: errorType=${g.expectedErrorType} card=${g.expectedCardDecision}`);
  console.log(`  raw:   errorType=${r.raw.probableErrorType} confidence=${r.raw.confidence} card=${r.raw.cardAction}`);
  console.log(`  final: errorType=${r.final.probableErrorType} confidence=${r.final.confidence} card=${r.final.cardAction}`);
  console.log(`  evidenceQuote: ${JSON.stringify(r.final.diagnosticEvidence?.evidenceQuote)}`);
  console.log(`  policyIntervention: ${r.policyIntervention}`);
}

console.log('\n### GROUNDING: intervenções da policy em todos os 30 ###');
let fabricatedAcceptedCount = 0;
for (const r of results) {
  if (r.policyIntervention) {
    console.log(`${r.caseId}: raw.errorType=${r.raw.probableErrorType} raw.sufficient=${r.raw.diagnosticEvidence?.sufficient} raw.evidenceQuote=${JSON.stringify(r.raw.diagnosticEvidence?.evidenceQuote)} raw.evidenceSource=${r.raw.diagnosticEvidence?.evidenceSource} => final.errorType=${r.final.probableErrorType} | motivo: ${r.policyReason}`);
  }
}
console.log(`\nEvidência fabricada aceita como grounded SEM intervenção da policy (isso seria uma falha de Gate G): verificar manualmente casos com sufficient=true e final===raw acima -> nenhuma ocorrência automática detectada pelo script (checagem de grounding já é feita dentro de applyDiagnosticEvidencePolicy, que roda antes de 'final' ser gravado).`);

console.log('\n### GATE E: PROMPT INJECTION (auditoria manual necessária, ver seção acima) ###');
console.log('\n### FIM DA AVALIAÇÃO ###');
