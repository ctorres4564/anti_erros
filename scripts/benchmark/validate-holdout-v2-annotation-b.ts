/**
 * Validador estrutural EXCLUSIVO da Annotation B do holdout-v2.
 * Valida somente propriedades internas de B (schema, enums, invariantes).
 * NÃO valida distribuição por categoria, quantidade de prompt injection,
 * quantidade CREATE/NO_CARD, nem concordância com Annotation A — isso é
 * responsabilidade do Agente C na adjudicação, fora do escopo deste script.
 *
 * Uso: npx tsx scripts/benchmark/validate-holdout-v2-annotation-b.ts
 */
import annotationB from './holdout-v2-annotation-b.json';

const ERROR_TYPES = ['KNOWLEDGE_GAP', 'CONCEPT_CONFUSION', 'EXCEPTION_MISSED', 'APPLICATION_ERROR', 'READING_ERROR', 'INSUFFICIENT_INFORMATION'];
const OBSERVABILITY = ['CLEAR', 'AMBIGUOUS', 'UNOBSERVABLE'];
const YES_NO = ['YES', 'NO'];
const CARD_DECISIONS = ['CREATE', 'NO_CARD'];
const REQUIRED_KEYS = [
  'id',
  'expectedErrorType',
  'acceptableErrorTypes',
  'observability',
  'answerIndeterminate',
  'diagnosticIndeterminate',
  'expectedCardDecision',
  'justification',
  'promptInjectionDetected',
  'promptInjectionExpectedBehavior',
].sort();

interface AnnotationEntry {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  observability: string;
  answerIndeterminate: string;
  diagnosticIndeterminate: string;
  expectedCardDecision: string;
  justification: string;
  promptInjectionDetected: boolean;
  promptInjectionExpectedBehavior: string | null;
}

const entries = annotationB as AnnotationEntry[];
const errors: string[] = [];

function fail(msg: string) {
  errors.push(msg);
}

// 1. Exatamente 120 entradas
if (entries.length !== 120) fail(`Esperado 120 entradas, encontrado ${entries.length}`);

// 2. IDs V001-V120, únicos
const expectedIds = Array.from({ length: 120 }, (_, i) => `V${String(i + 1).padStart(3, '0')}`);
const ids = entries.map((e) => e.id);
const idSet = new Set(ids);
if (idSet.size !== ids.length) fail('IDs duplicados encontrados');
const sortedIds = [...ids].sort();
if (JSON.stringify(sortedIds) !== JSON.stringify(expectedIds)) fail('IDs não correspondem exatamente ao conjunto V001-V120');

// 3-10. Por entrada: campos obrigatórios, enums válidos, invariantes
for (const e of entries) {
  const keys = Object.keys(e).sort();
  if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_KEYS)) {
    fail(`${e.id}: chaves inesperadas — ${JSON.stringify(keys)}`);
  }

  if (!ERROR_TYPES.includes(e.expectedErrorType)) fail(`${e.id}: expectedErrorType inválido (${e.expectedErrorType})`);

  if (!Array.isArray(e.acceptableErrorTypes) || e.acceptableErrorTypes.length === 0) {
    fail(`${e.id}: acceptableErrorTypes ausente ou vazio`);
  } else {
    if (!e.acceptableErrorTypes.includes(e.expectedErrorType)) {
      fail(`${e.id}: acceptableErrorTypes não contém expectedErrorType`);
    }
    for (const t of e.acceptableErrorTypes) {
      if (!ERROR_TYPES.includes(t)) fail(`${e.id}: acceptableErrorTypes contém tipo inválido (${t})`);
    }
  }

  if (!OBSERVABILITY.includes(e.observability)) fail(`${e.id}: observability inválido (${e.observability})`);
  if (!YES_NO.includes(e.answerIndeterminate)) fail(`${e.id}: answerIndeterminate inválido (${e.answerIndeterminate})`);
  if (!YES_NO.includes(e.diagnosticIndeterminate)) fail(`${e.id}: diagnosticIndeterminate inválido (${e.diagnosticIndeterminate})`);
  if (!CARD_DECISIONS.includes(e.expectedCardDecision)) fail(`${e.id}: expectedCardDecision inválido (${e.expectedCardDecision})`);

  if (typeof e.justification !== 'string' || e.justification.trim().length < 10) {
    fail(`${e.id}: justification ausente ou muito curta`);
  }

  // UNOBSERVABLE => diagnosticIndeterminate=YES => INSUFFICIENT_INFORMATION
  if (e.observability === 'UNOBSERVABLE') {
    if (e.diagnosticIndeterminate !== 'YES') fail(`${e.id}: UNOBSERVABLE exige diagnosticIndeterminate=YES`);
    if (e.expectedErrorType !== 'INSUFFICIENT_INFORMATION') fail(`${e.id}: UNOBSERVABLE exige expectedErrorType=INSUFFICIENT_INFORMATION`);
  }

  // INSUFFICIENT_INFORMATION => diagnosticIndeterminate=YES
  if (e.expectedErrorType === 'INSUFFICIENT_INFORMATION' && e.diagnosticIndeterminate !== 'YES') {
    fail(`${e.id}: expectedErrorType=INSUFFICIENT_INFORMATION exige diagnosticIndeterminate=YES`);
  }

  // promptInjectionDetected=false => promptInjectionExpectedBehavior=null
  if (e.promptInjectionDetected === false && e.promptInjectionExpectedBehavior !== null) {
    fail(`${e.id}: promptInjectionDetected=false mas promptInjectionExpectedBehavior não é null`);
  }

  // promptInjectionDetected=true => comportamento esperado preenchido
  if (e.promptInjectionDetected === true) {
    if (typeof e.promptInjectionExpectedBehavior !== 'string' || e.promptInjectionExpectedBehavior.trim().length < 5) {
      fail(`${e.id}: promptInjectionDetected=true exige promptInjectionExpectedBehavior preenchido`);
    }
  }
}

if (errors.length > 0) {
  console.error(`FALHAS ESTRUTURAIS (${errors.length}):`);
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}

console.log('STRUCTURAL VALIDATION: PASS');
console.log(`Total: ${entries.length} entradas, IDs V001-V120 únicos, todos os campos/enums/invariantes válidos.`);
