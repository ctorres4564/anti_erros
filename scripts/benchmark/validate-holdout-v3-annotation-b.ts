/**
 * Validador independente da Anotação B (Holdout-V3 Candidate Pool).
 *
 * Verifica APENAS a consistência interna do arquivo
 * holdout-v3-annotation-b.json em relação ao protocolo
 * docs/SPRINT_3_HOLDOUT_V3_PROTOCOL.md. Este validador NUNCA compara
 * a Anotação B com a Anotação A — concordância inter-anotadores é
 * responsabilidade exclusiva do Agente C na Fase 3.
 *
 * Uso: npx tsx scripts/benchmark/validate-holdout-v3-annotation-b.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { candidates } from "./holdout-v3-candidate-pool";

const ERROR_TYPES = [
  "KNOWLEDGE_GAP",
  "CONCEPT_CONFUSION",
  "EXCEPTION_MISSED",
  "APPLICATION_ERROR",
  "READING_ERROR",
  "INSUFFICIENT_INFORMATION",
] as const;
type ErrorType = (typeof ERROR_TYPES)[number];

const OBSERVABILITY = ["CLEAR", "AMBIGUOUS", "UNOBSERVABLE"] as const;
const YES_NO = ["YES", "NO"] as const;
const CARD_DECISION = ["CREATE", "NO_CARD"] as const;

interface CardCriteria {
  stableContent: "YES" | "NO";
  generalizableContent: "YES" | "NO";
  retrievableContent: "YES" | "NO";
  futureReviewUseful: "YES" | "NO";
}

interface AnnotationB {
  id: string;
  expectedErrorType: ErrorType;
  acceptableErrorTypes: string[];
  observability: (typeof OBSERVABILITY)[number];
  answerIndeterminate: "YES" | "NO";
  diagnosticIndeterminate: "YES" | "NO";
  expectedCardDecision: (typeof CARD_DECISION)[number];
  cardCriteria: CardCriteria;
  promptInjectionDetected: boolean;
  promptInjectionExpectedBehavior: string | null;
  justification: string;
}

interface Failure {
  id: string;
  rule: string;
  detail: string;
}

const failures: Failure[] = [];
function fail(id: string, rule: string, detail: string) {
  failures.push({ id, rule, detail });
}

const path = join(__dirname, "holdout-v3-annotation-b.json");
const raw = readFileSync(path, "utf-8");
let data: AnnotationB[];
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error("FALHA CRÍTICA: JSON inválido em holdout-v3-annotation-b.json");
  console.error(e);
  process.exit(1);
}

// 1. Estrutura: array de exatamente 180 objetos
if (!Array.isArray(data)) {
  console.error("FALHA CRÍTICA: o arquivo não contém um array.");
  process.exit(1);
}
if (data.length !== 180) {
  fail("GLOBAL", "pool-size", `Esperado 180 casos, encontrado ${data.length}.`);
}

// 2. IDs batem exatamente com o candidate pool (P001..P180), sem duplicatas
const poolIds = new Set(candidates.map((c) => c.id));
const seenIds = new Set<string>();
for (const c of candidates) {
  if (!/^P\d{3}$/.test(c.id)) {
    fail(c.id, "id-format", "ID do candidate pool fora do padrão Pnnn.");
  }
}

for (const entry of data) {
  if (!entry.id) {
    fail("UNKNOWN", "missing-id", "Entrada sem campo id.");
    continue;
  }
  if (seenIds.has(entry.id)) {
    fail(entry.id, "duplicate-id", "ID duplicado na anotação B.");
  }
  seenIds.add(entry.id);
  if (!poolIds.has(entry.id)) {
    fail(entry.id, "unknown-id", "ID não existe no candidate pool (P001-P180).");
  }
}
for (const id of poolIds) {
  if (!seenIds.has(id)) {
    fail(id, "missing-annotation", "Caso do candidate pool não foi anotado por B.");
  }
}

// 3. Campos obrigatórios e enums válidos
for (const entry of data) {
  const id = entry.id ?? "UNKNOWN";

  if (!ERROR_TYPES.includes(entry.expectedErrorType)) {
    fail(id, "invalid-error-type", `expectedErrorType inválido: ${entry.expectedErrorType}`);
  }
  if (!Array.isArray(entry.acceptableErrorTypes) || entry.acceptableErrorTypes.length === 0) {
    fail(id, "acceptable-error-types-empty", "acceptableErrorTypes deve ser um array não vazio.");
  } else {
    for (const t of entry.acceptableErrorTypes) {
      if (!ERROR_TYPES.includes(t as ErrorType)) {
        fail(id, "invalid-acceptable-error-type", `Tipo inválido em acceptableErrorTypes: ${t}`);
      }
    }
    if (!entry.acceptableErrorTypes.includes(entry.expectedErrorType)) {
      fail(
        id,
        "expected-not-in-acceptable",
        "expectedErrorType deve estar contido em acceptableErrorTypes."
      );
    }
  }
  if (!OBSERVABILITY.includes(entry.observability)) {
    fail(id, "invalid-observability", `observability inválido: ${entry.observability}`);
  }
  if (!YES_NO.includes(entry.answerIndeterminate)) {
    fail(id, "invalid-answer-indeterminate", `answerIndeterminate inválido: ${entry.answerIndeterminate}`);
  }
  if (!YES_NO.includes(entry.diagnosticIndeterminate)) {
    fail(id, "invalid-diagnostic-indeterminate", `diagnosticIndeterminate inválido: ${entry.diagnosticIndeterminate}`);
  }
  if (!CARD_DECISION.includes(entry.expectedCardDecision)) {
    fail(id, "invalid-card-decision", `expectedCardDecision inválido: ${entry.expectedCardDecision}`);
  }
  if (!entry.cardCriteria || typeof entry.cardCriteria !== "object") {
    fail(id, "missing-card-criteria", "cardCriteria ausente.");
  } else {
    for (const key of [
      "stableContent",
      "generalizableContent",
      "retrievableContent",
      "futureReviewUseful",
    ] as const) {
      const v = entry.cardCriteria[key];
      if (!YES_NO.includes(v)) {
        fail(id, "invalid-card-criterion", `cardCriteria.${key} inválido: ${v}`);
      }
    }
  }
  if (typeof entry.promptInjectionDetected !== "boolean") {
    fail(id, "invalid-injection-flag", "promptInjectionDetected deve ser boolean.");
  }
  if (!entry.justification || typeof entry.justification !== "string" || entry.justification.trim().length < 10) {
    fail(id, "missing-justification", "justification ausente ou muito curta.");
  }
}

// 4. Regras de consistência do protocolo (Seções 4, 5, 6, 7, 8)
for (const entry of data) {
  const id = entry.id ?? "UNKNOWN";

  // Seção 6: observability <-> diagnosticIndeterminate
  if (entry.observability === "CLEAR" && entry.diagnosticIndeterminate !== "NO") {
    fail(id, "clear-implies-di-no", "observability=CLEAR exige diagnosticIndeterminate=NO.");
  }
  if (
    (entry.observability === "AMBIGUOUS" || entry.observability === "UNOBSERVABLE") &&
    entry.diagnosticIndeterminate !== "YES"
  ) {
    fail(
      id,
      "ambiguous-unobservable-implies-di-yes",
      "observability=AMBIGUOUS/UNOBSERVABLE exige diagnosticIndeterminate=YES."
    );
  }
  if (entry.observability === "UNOBSERVABLE" && entry.expectedErrorType !== "INSUFFICIENT_INFORMATION") {
    fail(
      id,
      "unobservable-implies-ii",
      "observability=UNOBSERVABLE exige expectedErrorType=INSUFFICIENT_INFORMATION."
    );
  }

  // Seção 4: II <-> diagnosticIndeterminate=YES (regra bicondicional forte)
  if (entry.expectedErrorType === "INSUFFICIENT_INFORMATION" && entry.diagnosticIndeterminate !== "YES") {
    fail(
      id,
      "ii-requires-di-yes",
      "expectedErrorType=INSUFFICIENT_INFORMATION exige diagnosticIndeterminate=YES (regra §4.1)."
    );
  }
  if (entry.diagnosticIndeterminate === "YES" && entry.expectedErrorType !== "INSUFFICIENT_INFORMATION") {
    fail(
      id,
      "di-yes-requires-ii",
      "diagnosticIndeterminate=YES exige expectedErrorType=INSUFFICIENT_INFORMATION."
    );
  }

  // Seção 5.1: answerIndeterminate=YES NÃO determina II (não pode ser a única base para dI=YES sem observability compatível)
  // (checado indiretamente pelas regras de observability acima)

  // Seção 7.1: regra dos quatro eixos objetivos
  if (entry.cardCriteria) {
    const vals = [
      entry.cardCriteria.stableContent,
      entry.cardCriteria.generalizableContent,
      entry.cardCriteria.retrievableContent,
      entry.cardCriteria.futureReviewUseful,
    ];
    const allYes = vals.every((v) => v === "YES");
    if (entry.expectedCardDecision === "CREATE" && !allYes) {
      fail(id, "create-requires-all-yes", "expectedCardDecision=CREATE exige YES nos quatro eixos (§7.1).");
    }
    if (entry.expectedCardDecision === "NO_CARD" && allYes) {
      fail(
        id,
        "no-card-requires-one-no",
        "expectedCardDecision=NO_CARD exige ao menos um eixo NO (§7.1), mas todos os quatro estão YES."
      );
    }
  }

  // Seção 8: promptInjectionExpectedBehavior obrigatório sse promptInjectionDetected=true
  if (entry.promptInjectionDetected === true) {
    if (!entry.promptInjectionExpectedBehavior || entry.promptInjectionExpectedBehavior.trim().length < 5) {
      fail(
        id,
        "injection-behavior-required",
        "promptInjectionDetected=true exige promptInjectionExpectedBehavior preenchido (§8)."
      );
    }
  } else if (entry.promptInjectionDetected === false) {
    if (entry.promptInjectionExpectedBehavior !== null) {
      fail(
        id,
        "injection-behavior-must-be-null",
        "promptInjectionDetected=false exige promptInjectionExpectedBehavior=null."
      );
    }
  }
}

// 5. Verificação cruzada com o texto observável do candidate pool: todo caso
// marcado como promptInjectionDetected=true deve ter algum marcador textual
// adversarial nos campos question/userAnswer (sanity check anti-alucinação).
const INJECTION_MARKERS = /INJE|PAYLOAD|COMANDO N|COMANDO I|ADVERSARIAL|CONTEÚDO ADVERSARIAL/i;
const byId = new Map(candidates.map((c) => [c.id, c]));
for (const entry of data) {
  const cand = byId.get(entry.id);
  if (!cand) continue;
  const haystack = `${cand.question} ${cand.userAnswer}`;
  const hasMarker = INJECTION_MARKERS.test(haystack);
  if (entry.promptInjectionDetected && !hasMarker) {
    fail(entry.id, "injection-false-positive", "promptInjectionDetected=true sem marcador textual adversarial visível nos campos observáveis.");
  }
  if (!entry.promptInjectionDetected && hasMarker) {
    fail(entry.id, "injection-false-negative", "Marcador textual adversarial presente nos campos observáveis, mas promptInjectionDetected=false.");
  }
}

// ---- Relatório ----
const total = data.length;
const byErrorType: Record<string, number> = {};
const byObservability: Record<string, number> = {};
const byCombo: Record<string, number> = {};
const byCard: Record<string, number> = {};
let injectionCount = 0;

for (const e of data) {
  byErrorType[e.expectedErrorType] = (byErrorType[e.expectedErrorType] ?? 0) + 1;
  byObservability[e.observability] = (byObservability[e.observability] ?? 0) + 1;
  const combo = `aI=${e.answerIndeterminate}/dI=${e.diagnosticIndeterminate}`;
  byCombo[combo] = (byCombo[combo] ?? 0) + 1;
  byCard[e.expectedCardDecision] = (byCard[e.expectedCardDecision] ?? 0) + 1;
  if (e.promptInjectionDetected) injectionCount++;
}

console.log("=== VALIDAÇÃO ESTRUTURAL — HOLDOUT-V3 ANOTAÇÃO B (consistência interna) ===\n");
console.log(`Total de casos: ${total}`);
console.log("\n-- Distribuição por errorType --");
for (const t of ERROR_TYPES) console.log(`  ${t}: ${byErrorType[t] ?? 0}`);
console.log("\n-- Observabilidade --");
for (const o of OBSERVABILITY) console.log(`  ${o}: ${byObservability[o] ?? 0}`);
console.log("\n-- Combinações answer/diagnostic indeterminate --");
for (const k of Object.keys(byCombo).sort()) console.log(`  ${k}: ${byCombo[k]}`);
console.log("\n-- Decisão de card --");
for (const c of CARD_DECISION) console.log(`  ${c}: ${byCard[c] ?? 0}`);
console.log(`\n-- Prompt injection detectada: ${injectionCount} casos --`);

console.log("\n=== RESULTADO ===");
if (failures.length === 0) {
  console.log("STRUCTURAL VALIDATION: PASS");
  process.exit(0);
} else {
  console.log(`STRUCTURAL VALIDATION: FAIL (${failures.length} problema(s))`);
  for (const f of failures) {
    console.log(`  [${f.id}] ${f.rule}: ${f.detail}`);
  }
  process.exit(1);
}
