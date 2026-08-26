// Monta a tabela comparativa final (N candidatos) a partir dos arquivos de
// resultado + julgamento já gerados. Não recalcula nada do scorer congelado —
// apenas lê e formata.
import fs from 'node:fs';

const THRESHOLDS = {
  schemaCompliance: 1.0,
  factualCorrectness: 0.98,
  hallucinationRate: 0.01,
  createVsNoCard: 0.95,
  errorClassification: 0.9,
  pedagogicalQuality: 0.92,
  uncertaintyHandling: 0.95,
};

// candidates: [{ label, reportPath, judgmentPath }]
const candidates = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

function loadReport(p) {
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return Array.isArray(data) ? data[0] : data;
}
function loadJudgment(p) {
  return p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null;
}
function computeFactual(j) {
  if (!j) return { rate: null, num: 0, den: 0 };
  const ev = j.factual.filter((x) => x.verdict !== null);
  const pass = ev.filter((x) => x.verdict === 'PASS').length;
  return { rate: ev.length ? pass / ev.length : null, num: pass, den: ev.length };
}
function computeHallucination(j) {
  if (!j) return { rate: null, num: 0, den: 0 };
  const ev = j.factual.filter((x) => x.verdict !== null);
  const h = ev.filter((x) => x.hallucination === true).length;
  return { rate: ev.length ? h / ev.length : null, num: h, den: ev.length };
}
function computePedagogical(j) {
  if (!j) return { rate: null, num: 0, den: 0 };
  const ev = j.pedagogical.filter((x) => x.approved !== null);
  const a = ev.filter((x) => x.approved === true).length;
  return { rate: ev.length ? a / ev.length : null, num: a, den: ev.length };
}
function pf(v, t, dir = 'gte') {
  if (v === null || v === undefined || Number.isNaN(v)) return 'PENDENTE';
  return dir === 'gte' ? (v >= t ? 'PASS' : 'FAIL') : v <= t ? 'PASS' : 'FAIL';
}
function pct(v) {
  return v === null || v === undefined || Number.isNaN(v) ? 'N/A' : (v * 100).toFixed(2) + '%';
}

const rows = candidates.map(({ label, reportPath, judgmentPath }) => {
  const report = loadReport(reportPath);
  const judgment = loadJudgment(judgmentPath);
  const factual = computeFactual(judgment);
  const hallucination = computeHallucination(judgment);
  const pedagogical = computePedagogical(judgment);
  const uncertaintyRate = report.uncertaintyHandling?.denominator
    ? report.uncertaintyHandling.correct / report.uncertaintyHandling.denominator
    : null;
  const injectionRate = report.promptInjectionResistance?.denominator
    ? report.promptInjectionResistance.resisted / report.promptInjectionResistance.denominator
    : null;

  const verdict = {
    schema: pf(report.schemaComplianceRate, THRESHOLDS.schemaCompliance),
    classification: pf(report.errorTypeAccuracy, THRESHOLDS.errorClassification),
    createVsNoCard: pf(report.createVsNoCardAccuracy, THRESHOLDS.createVsNoCard),
    uncertainty: pf(uncertaintyRate, THRESHOLDS.uncertaintyHandling),
    factual: pf(factual.rate, THRESHOLDS.factualCorrectness),
    hallucination: pf(hallucination.rate, THRESHOLDS.hallucinationRate, 'lte'),
    pedagogical: pf(pedagogical.rate, THRESHOLDS.pedagogicalQuality),
  };
  const allPass = Object.values(verdict).every((v) => v === 'PASS');

  return {
    label,
    model: report.model,
    schemaComplianceRate: report.schemaComplianceRate,
    errorTypeAccuracy: report.errorTypeAccuracy,
    createVsNoCardAccuracy: report.createVsNoCardAccuracy,
    exactCardActionAccuracy: report.exactCardActionAccuracy,
    uncertaintyRate,
    injectionRate,
    factual,
    hallucination,
    pedagogical,
    avgLatencyMs: report.avgLatencyMs,
    p95LatencyMs: report.p95LatencyMs,
    totalInputTokens: report.totalInputTokens,
    totalOutputTokens: report.totalOutputTokens,
    estimatedCostPer1000Valid: report.estimatedCostPer1000Valid,
    retries: report.totalRetries,
    failures: report.httpFailures + report.timeouts + report.schemaFailures,
    verdict,
    allPass,
  };
});

console.log('| Métrica |', rows.map((r) => r.label).join(' | '), '|');
console.log('|---|', rows.map(() => '---').join('|'), '|');
const line = (name, fn) => console.log(`| ${name} |`, rows.map(fn).join(' | '), '|');
line('Schema', (r) => `${pct(r.schemaComplianceRate)} (${r.verdict.schema})`);
line('Classification', (r) => `${pct(r.errorTypeAccuracy)} (${r.verdict.classification})`);
line('CREATE/NO_CARD', (r) => `${pct(r.createVsNoCardAccuracy)} (${r.verdict.createVsNoCard})`);
line('Exact Card Action', (r) => pct(r.exactCardActionAccuracy));
line('Uncertainty', (r) => `${pct(r.uncertaintyRate)} (${r.verdict.uncertainty})`);
line('Prompt Injection Resist.', (r) => pct(r.injectionRate));
line('Factual', (r) => `${pct(r.factual.rate)} (${r.verdict.factual})`);
line('Hallucination', (r) => `${pct(r.hallucination.rate)} (${r.verdict.hallucination})`);
line('Pedagogical', (r) => `${pct(r.pedagogical.rate)} (${r.verdict.pedagogical})`);
line('Latency avg', (r) => `${Math.round(r.avgLatencyMs)}ms`);
line('Latency p95', (r) => `${r.p95LatencyMs}ms`);
line('Retries', (r) => r.retries);
line('Failures', (r) => r.failures);
line('Cost/1000 valid', (r) => (r.estimatedCostPer1000Valid != null ? `US$${r.estimatedCostPer1000Valid.toFixed(3)}` : 'N/A'));
line('TODOS OS THRESHOLDS', (r) => (r.allPass ? '✅ PASS' : '❌ FAIL'));

const passers = rows.filter((r) => r.allPass);
console.log('\nCandidatos aprovados em TODOS os thresholds:', passers.length ? passers.map((r) => r.label).join(', ') : 'NENHUM');
if (passers.length > 1) {
  const cheapest = passers.reduce((a, b) => ((a.estimatedCostPer1000Valid ?? Infinity) <= (b.estimatedCostPer1000Valid ?? Infinity) ? a : b));
  console.log('Mais barato entre os aprovados:', cheapest.label, `(US$${cheapest.estimatedCostPer1000Valid?.toFixed(3)}/1000)`);
}
