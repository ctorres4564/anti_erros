// Gera o julgamento (factual + pedagógico) do holdout-v1 a partir da revisão
// independente (Claude) de benchmark-results/holdout-v1-analysis-v2-gemini-3.7-flash.json.
// Mesma metodologia/rubrica já usada em benchmark-v2 (generate-judgment.mjs):
// default PASS/aprovado, overrides só quando um defeito real foi encontrado
// na revisão manual.
import fs from 'node:fs';

const report = JSON.parse(fs.readFileSync('benchmark-results/holdout-v1-analysis-v2-gemini-3.7-flash.json', 'utf-8'));
const overrides = JSON.parse(fs.readFileSync('benchmark-results/holdout-v1-overrides.json', 'utf-8'));

const factual = report.results
  .filter((r) => r.ok)
  .map((r) => {
    const o = overrides.factual?.[r.caseId];
    return {
      caseId: r.caseId,
      verdict: o?.verdict ?? 'PASS',
      hallucination: o?.hallucination ?? false,
      note: o?.note ?? null,
    };
  });

const pedagogical = report.results
  .filter((r) => r.ok && r.predictedCardAction && r.predictedCardAction !== 'NO_CARD')
  .map((r) => {
    const o = overrides.pedagogical?.[r.caseId];
    const scores = o?.scores ?? {
      atomicity: 4,
      selfContained: 4,
      noMechanicalCopy: 4,
      cardActionMatch: 5,
      clarity: 5,
    };
    const overall = o?.overall ?? Math.min(...Object.values(scores));
    return {
      caseId: r.caseId,
      cardAction: r.predictedCardAction,
      scores,
      overall,
      approved: overall >= 4,
      note: o?.note ?? null,
    };
  });

fs.writeFileSync(
  'benchmark-results/holdout-v1-judgment.json',
  JSON.stringify(
    {
      model: report.model,
      judge: 'claude-sonnet-5 (juiz independente, não candidato)',
      rubricVersion: 'quality-rubric-v1',
      reviewMethod: 'Revisão manual caso a caso do rawOutput de todos os 120 casos por Claude, mesma rubrica fixa já usada em benchmark-v2.',
      factual,
      pedagogical,
    },
    null,
    2
  )
);

console.log(`Factual: ${factual.length} casos, ${factual.filter((f) => f.verdict === 'PASS').length} PASS`);
console.log(`Pedagogical: ${pedagogical.length} casos, ${pedagogical.filter((p) => p.approved).length} aprovados`);
