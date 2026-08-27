/**
 * validate-holdout-ground-truth.ts
 *
 * Structural validator for the holdout v1 ground truth.
 * Validates all constraints defined in the holdout protocol.
 */

import * as fs from 'fs';

const GROUND_TRUTH_PATH = 'scripts/benchmark/holdout-v1-ground-truth.json';

const VALID_ERROR_TYPES = [
  'KNOWLEDGE_GAP',
  'CONCEPT_CONFUSION',
  'EXCEPTION_MISSED',
  'APPLICATION_ERROR',
  'READING_ERROR',
  'INSUFFICIENT_INFORMATION',
] as const;

const VALID_OBSERVABILITY = ['CLEAR', 'AMBIGUOUS', 'UNOBSERVABLE'] as const;
const VALID_CARD_DECISIONS = ['CREATE', 'NO_CARD'] as const;

type ErrorType = (typeof VALID_ERROR_TYPES)[number];
type Observability = (typeof VALID_OBSERVABILITY)[number];
type CardDecision = (typeof VALID_CARD_DECISIONS)[number];

interface GroundTruthEntry {
  id: string;
  expectedErrorType: ErrorType;
  acceptableErrorTypes: ErrorType[];
  observability: Observability;
  expectedCardDecision: CardDecision;
  justification: string;
  promptInjectionCase: boolean;
  promptInjectionExpectedBehavior: string;
}

function validate(): boolean {
  const errors: string[] = [];

  // Read file
  let entries: GroundTruthEntry[];
  try {
    const raw = fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8');
    entries = JSON.parse(raw);
  } catch (e) {
    console.error(`FAIL: Cannot read/parse ${GROUND_TRUTH_PATH}: ${e}`);
    return false;
  }

  // 1. Exactly 120 cases
  if (entries.length !== 120) {
    errors.push(`Expected exactly 120 cases, got ${entries.length}`);
  }

  // 2. IDs H001–H120, unique, all present
  const expectedIds = new Set<string>();
  for (let i = 1; i <= 120; i++) {
    expectedIds.add(`H${String(i).padStart(3, '0')}`);
  }
  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      errors.push(`Duplicate ID: ${entry.id}`);
    }
    seenIds.add(entry.id);
    if (!expectedIds.has(entry.id)) {
      errors.push(`Unexpected ID: ${entry.id}`);
    }
  }
  for (const expected of expectedIds) {
    if (!seenIds.has(expected)) {
      errors.push(`Missing ID: ${expected}`);
    }
  }

  for (const entry of entries) {
    const prefix = `[${entry.id}]`;

    // 3. Valid enums
    if (!VALID_ERROR_TYPES.includes(entry.expectedErrorType as any)) {
      errors.push(`${prefix} Invalid expectedErrorType: ${entry.expectedErrorType}`);
    }

    if (!Array.isArray(entry.acceptableErrorTypes) || entry.acceptableErrorTypes.length === 0) {
      errors.push(`${prefix} acceptableErrorTypes must be a non-empty array`);
    } else {
      for (const aet of entry.acceptableErrorTypes) {
        if (!VALID_ERROR_TYPES.includes(aet as any)) {
          errors.push(`${prefix} Invalid acceptableErrorType: ${aet}`);
        }
      }
    }

    if (!VALID_OBSERVABILITY.includes(entry.observability as any)) {
      errors.push(`${prefix} Invalid observability: ${entry.observability}`);
    }

    if (!VALID_CARD_DECISIONS.includes(entry.expectedCardDecision as any)) {
      errors.push(`${prefix} Invalid expectedCardDecision: ${entry.expectedCardDecision}`);
    }

    // 4. acceptableErrorTypes contains expectedErrorType
    if (Array.isArray(entry.acceptableErrorTypes) &&
        !entry.acceptableErrorTypes.includes(entry.expectedErrorType)) {
      errors.push(`${prefix} expectedErrorType '${entry.expectedErrorType}' not in acceptableErrorTypes`);
    }

    // 5. UNOBSERVABLE => INSUFFICIENT_INFORMATION
    if (entry.observability === 'UNOBSERVABLE' &&
        entry.expectedErrorType !== 'INSUFFICIENT_INFORMATION') {
      errors.push(`${prefix} UNOBSERVABLE must have expectedErrorType = INSUFFICIENT_INFORMATION, got ${entry.expectedErrorType}`);
    }

    // 6. Justification present
    if (!entry.justification || entry.justification.trim().length === 0) {
      errors.push(`${prefix} Missing justification`);
    }

    // 7. promptInjectionCase is boolean
    if (typeof entry.promptInjectionCase !== 'boolean') {
      errors.push(`${prefix} promptInjectionCase must be boolean, got ${typeof entry.promptInjectionCase}`);
    }

    // 8. promptInjectionExpectedBehavior coherence
    if (entry.promptInjectionCase === true) {
      if (!entry.promptInjectionExpectedBehavior ||
          entry.promptInjectionExpectedBehavior === 'Não aplicável.') {
        errors.push(`${prefix} promptInjectionCase=true but no expected behavior`);
      }
    }
    if (entry.promptInjectionCase === false) {
      if (entry.promptInjectionExpectedBehavior &&
          entry.promptInjectionExpectedBehavior !== 'Não aplicável.' &&
          entry.promptInjectionExpectedBehavior !== null) {
        // This is a warning, not necessarily an error
      }
    }

    // 9. No model prediction stored
    if ('modelPrediction' in entry || 'predictedErrorType' in entry || 'modelResult' in entry) {
      errors.push(`${prefix} Contains model prediction field — ground truth must not store predictions`);
    }
  }

  // 10. Exactly 120 card decisions
  const cardCount = entries.filter(e =>
    VALID_CARD_DECISIONS.includes(e.expectedCardDecision as any)
  ).length;
  if (cardCount !== 120) {
    errors.push(`Expected 120 card decisions, got ${cardCount}`);
  }

  // Report results
  if (errors.length === 0) {
    console.log('✅ GROUND TRUTH STRUCTURAL VALIDATION: PASS');
    console.log(`   ${entries.length} cases validated`);
    console.log(`   All IDs H001-H120 present and unique`);
    console.log(`   All enums valid`);
    console.log(`   All acceptableErrorTypes contain expectedErrorType`);
    console.log(`   UNOBSERVABLE => INSUFFICIENT_INFORMATION: verified`);
    console.log(`   All 120 card decisions present`);
    console.log(`   promptInjectionCase coherence: verified`);
    console.log(`   No model predictions stored`);
    return true;
  } else {
    console.error('❌ GROUND TRUTH STRUCTURAL VALIDATION: FAIL');
    for (const err of errors) {
      console.error(`   ${err}`);
    }
    return false;
  }
}

const result = validate();
process.exit(result ? 0 : 1);
