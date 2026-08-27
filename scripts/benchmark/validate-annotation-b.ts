import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ERROR_TYPES = [
  "KNOWLEDGE_GAP",
  "CONCEPT_CONFUSION",
  "EXCEPTION_MISSED",
  "APPLICATION_ERROR",
  "READING_ERROR",
  "INSUFFICIENT_INFORMATION",
] as const;

const OBSERVABILITIES = ["CLEAR", "AMBIGUOUS", "UNOBSERVABLE"] as const;
const CARD_DECISIONS = ["CREATE", "NO_CARD"] as const;

const EXPECTED_IDS: string[] = Array.from(
  { length: 120 },
  (_, i) => `H${String(i + 1).padStart(3, "0")}`,
);

function main() {
  const file = resolve(__dirname, "holdout-v1-annotation-b.json");
  const raw = readFileSync(file, "utf8");
  const data: unknown = JSON.parse(raw);

  const failures: string[] = [];
  const fail = (m: string) => failures.push(m);

  if (!Array.isArray(data)) {
    fail("annotation must be an array");
    return report(failures);
  }

  if (data.length !== 120) {
    fail(`expected exactly 120 entries, got ${data.length}`);
  }

  const seen = new Set<string>();

  for (const entry of data) {
    const e = entry as Record<string, unknown>;
    const id = e?.id as string | undefined;

    if (typeof id !== "string") {
      fail(`entry missing valid id: ${JSON.stringify(entry)}`);
      continue;
    }

    if (seen.has(id)) {
      fail(`duplicate id ${id}`);
    }
    seen.add(id);

    if (!EXPECTED_IDS.includes(id)) {
      fail(`unexpected id ${id}`);
    }

    for (const field of [
      "id",
      "expectedErrorType",
      "acceptableErrorTypes",
      "observability",
      "expectedCardDecision",
      "justification",
      "promptInjectionDetected",
      "promptInjectionExpectedBehavior",
    ]) {
      if (!(field in e)) {
        fail(`${id}: missing required field ${field}`);
      }
    }

    if (!ERROR_TYPES.includes(e.expectedErrorType as (typeof ERROR_TYPES)[number])) {
      fail(`${id}: invalid expectedErrorType ${String(e.expectedErrorType)}`);
    }

    if (!Array.isArray(e.acceptableErrorTypes) || e.acceptableErrorTypes.length === 0) {
      fail(`${id}: acceptableErrorTypes must be a non-empty array`);
    } else {
      for (const t of e.acceptableErrorTypes) {
        if (!ERROR_TYPES.includes(t as (typeof ERROR_TYPES)[number])) {
          fail(`${id}: invalid acceptableErrorType ${String(t)}`);
        }
      }
      if (!e.acceptableErrorTypes.includes(e.expectedErrorType)) {
        fail(`${id}: acceptableErrorTypes must include expectedErrorType`);
      }
    }

    if (!OBSERVABILITIES.includes(e.observability as (typeof OBSERVABILITIES)[number])) {
      fail(`${id}: invalid observability ${String(e.observability)}`);
    }

    if (!CARD_DECISIONS.includes(e.expectedCardDecision as (typeof CARD_DECISIONS)[number])) {
      fail(`${id}: invalid expectedCardDecision ${String(e.expectedCardDecision)}`);
    }

    if (typeof e.justification !== "string" || e.justification.trim().length === 0) {
      fail(`${id}: justification must be a non-empty string`);
    }

    if (typeof e.promptInjectionDetected !== "boolean") {
      fail(`${id}: promptInjectionDetected must be boolean`);
    }

    if (e.promptInjectionDetected === true) {
      if (
        typeof e.promptInjectionExpectedBehavior !== "string" ||
        e.promptInjectionExpectedBehavior.trim().length === 0
      ) {
        fail(`${id}: promptInjectionExpectedBehavior required when injection detected`);
      }
    } else if (e.promptInjectionExpectedBehavior !== null) {
      fail(`${id}: promptInjectionExpectedBehavior must be null when no injection`);
    }

    if (e.observability === "UNOBSERVABLE" && e.expectedErrorType !== "INSUFFICIENT_INFORMATION") {
      fail(`${id}: UNOBSERVABLE requires expectedErrorType=INSUFFICIENT_INFORMATION`);
    }
  }

  for (const id of EXPECTED_IDS) {
    if (!seen.has(id)) {
      fail(`missing expected id ${id}`);
    }
  }

  report(failures);
}

function report(failures: string[]) {
  if (failures.length > 0) {
    console.error("Annotation B structural validation: FAIL");
    for (const f of failures) console.error(" - " + f);
    process.exit(1);
  }
  console.log("Annotation B structural validation: PASS");
}

main();
