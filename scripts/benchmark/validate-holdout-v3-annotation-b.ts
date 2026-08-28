import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const annotationPath = path.join(here, "holdout-v3-annotation-b.json");
const data = JSON.parse(fs.readFileSync(annotationPath, "utf8"));

const TYPES = new Set(["KNOWLEDGE_GAP","CONCEPT_CONFUSION","EXCEPTION_MISSED","APPLICATION_ERROR","READING_ERROR","INSUFFICIENT_INFORMATION"]);
const OBS = new Set(["CLEAR","AMBIGUOUS","UNOBSERVABLE"]);
const YES_NO = new Set(["YES","NO"]);
const DECISIONS = new Set(["CREATE","NO_CARD"]);
const CRITERIA = ["stableContent","generalizableContent","retrievableContent","futureReviewUseful"];

function fail(message: string): never {
  throw new Error(message);
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}
function countBy(values: unknown[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = String(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

expect(Array.isArray(data), "A anotação B deve ser um array.");
expect(data.length === 180, `Esperados 180 casos; encontrados ${data.length}.`);
const ids = new Set<string>();

for (let index = 0; index < data.length; index += 1) {
  const item = data[index];
  const expectedId = `P${String(index + 1).padStart(3, "0")}`;
  expect(item && typeof item === "object" && !Array.isArray(item), `${expectedId}: registro inválido.`);
  expect(item.id === expectedId, `Posição ${index}: esperado ${expectedId}, recebido ${item.id}.`);
  expect(!ids.has(item.id), `${item.id}: ID duplicado.`);
  ids.add(item.id);
  expect(TYPES.has(item.expectedErrorType), `${item.id}: expectedErrorType inválido.`);
  expect(Array.isArray(item.acceptableErrorTypes) && item.acceptableErrorTypes.length > 0, `${item.id}: acceptableErrorTypes vazio.`);
  expect(new Set(item.acceptableErrorTypes).size === item.acceptableErrorTypes.length, `${item.id}: acceptableErrorTypes contém duplicata.`);
  expect(item.acceptableErrorTypes.every((type: unknown) => TYPES.has(String(type))), `${item.id}: categoria aceitável inválida.`);
  expect(item.acceptableErrorTypes.includes(item.expectedErrorType), `${item.id}: categoria esperada não está entre as aceitáveis.`);
  expect(OBS.has(item.observability), `${item.id}: observability inválida.`);
  expect(YES_NO.has(item.answerIndeterminate), `${item.id}: answerIndeterminate inválido.`);
  expect(YES_NO.has(item.diagnosticIndeterminate), `${item.id}: diagnosticIndeterminate inválido.`);
  expect(DECISIONS.has(item.expectedCardDecision), `${item.id}: expectedCardDecision inválido.`);
  expect(item.cardCriteria && typeof item.cardCriteria === "object" && !Array.isArray(item.cardCriteria), `${item.id}: cardCriteria inválido.`);
  expect(Object.keys(item.cardCriteria).length === CRITERIA.length, `${item.id}: cardCriteria deve conter somente os quatro eixos.`);
  for (const criterion of CRITERIA) expect(YES_NO.has(item.cardCriteria[criterion]), `${item.id}: ${criterion} inválido.`);
  const allCriteriaYes = CRITERIA.every((criterion) => item.cardCriteria[criterion] === "YES");
  expect((item.expectedCardDecision === "CREATE") === allCriteriaYes, `${item.id}: decisão de card inconsistente com os quatro eixos.`);
  expect(typeof item.promptInjectionDetected === "boolean", `${item.id}: promptInjectionDetected deve ser booleano.`);
  expect(
    item.promptInjectionDetected
      ? typeof item.promptInjectionExpectedBehavior === "string" && item.promptInjectionExpectedBehavior.trim().length > 0
      : item.promptInjectionExpectedBehavior === null,
    `${item.id}: comportamento de prompt injection inconsistente.`
  );
  expect(typeof item.justification === "string" && item.justification.trim().length >= 30, `${item.id}: justificativa insuficiente.`);

  const diagnosticYes = item.diagnosticIndeterminate === "YES";
  expect((item.expectedErrorType === "INSUFFICIENT_INFORMATION") === diagnosticYes, `${item.id}: INSUFFICIENT_INFORMATION deve equivaler a diagnosticIndeterminate=YES.`);
  if (item.observability === "CLEAR") expect(!diagnosticYes, `${item.id}: CLEAR incompatível com diagnóstico indeterminado.`);
  if (item.observability === "UNOBSERVABLE") expect(diagnosticYes, `${item.id}: UNOBSERVABLE exige diagnóstico indeterminado.`);
  if (item.observability === "AMBIGUOUS") expect(diagnosticYes, `${item.id}: AMBIGUOUS exige diagnóstico indeterminado.`);
  if (diagnosticYes) {
    for (const marker of ["Causa plausível 1:", "Causa plausível 2:", "Compatibilidade bicausal:", "Informação ausente:"]) {
      expect(item.justification.includes(marker), `${item.id}: justificativa II sem marcador ${marker}`);
    }
  }
}

const combinations = countBy(data.map((item: any) => `${item.answerIndeterminate}/${item.diagnosticIndeterminate}`));
const metrics = {
  total: data.length,
  errorType: countBy(data.map((item: any) => item.expectedErrorType)),
  observability: countBy(data.map((item: any) => item.observability)),
  answerDiagnosticCombinations: combinations,
  cards: countBy(data.map((item: any) => item.expectedCardDecision)),
  promptInjectionDetected: countBy(data.map((item: any) => item.promptInjectionDetected))
};
console.log("HOLDOUT-V3 ANNOTATION B VALID");
console.log(JSON.stringify(metrics, null, 2));

