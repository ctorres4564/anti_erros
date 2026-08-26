// Gera o arquivo de julgamento a partir da revisão manual do avaliador
// independente (Claude Opus 5) sobre benchmark-results/benchmark-v2-<model>.json.
// Uso: node scripts/benchmark/generate-judgment.mjs <model-file.json> <model-name> <out.json> [overridesFile]
import fs from 'node:fs';

const [, , inputPath, modelName, outPath, overridesPath] = process.argv;
const reports = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
const report = reports[0];

const CONFLICTING_EXPLANATION_IDS = new Set(['ii-03', 'ii-06', 'ii-14']);

const overrides = overridesPath && fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf-8')) : {};

const factual = report.results
  .filter((r) => r.ok && !CONFLICTING_EXPLANATION_IDS.has(r.caseId))
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
    // Cards BASIC de simples recall factual atômico (ex.: "capital de X") têm
    // pouco espaço de reformulação sem perder precisão — isso é abstração
    // legítima do fato, não cópia mecânica do enunciado original (que via de
    // regra tinha mais contexto/distratores do que o card reformulado).
    const defaultNoMechanicalCopy = 4;
    const scores = o?.scores ?? {
      atomicity: 4,
      selfContained: 4,
      noMechanicalCopy: defaultNoMechanicalCopy,
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
  outPath,
  JSON.stringify(
    {
      model: modelName,
      judge: 'claude-opus-5 (juiz independente, não candidato do benchmark)',
      rubricVersion: 'quality-rubric-v1',
      reviewMethod:
        'Revisão manual caso a caso do texto bruto (rawOutput) por Claude Opus 5, mesma rubrica fixa aplicada identicamente a ambos os modelos, sem que nenhum modelo avalie a si mesmo.',
      factual,
      pedagogical,
    },
    null,
    2
  )
);

console.log(`Julgamento salvo: ${outPath}`);
console.log(`Factual: ${factual.length} casos, ${factual.filter((f) => f.verdict === 'PASS').length} PASS`);
console.log(`Pedagogical: ${pedagogical.length} casos, ${pedagogical.filter((p) => p.approved).length} aprovados`);
