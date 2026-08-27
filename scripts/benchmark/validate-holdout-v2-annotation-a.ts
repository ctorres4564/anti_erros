/**
 * SPRINT 3 — VALIDADOR ESTRUTURAL DO HOLDOUT-V2 ANNOTATION A
 * 
 * Valida integralmente sem modelo as restrições metodológicas do protocolo congelado.
 */

import * as fs from 'fs';
import * as path from 'path';
import { HOLDOUT_V2_CASES, HoldoutV2Case } from './holdout-v2-cases';

export interface HoldoutV2AnnotationA {
  id: string;
  expectedErrorType: 'KNOWLEDGE_GAP' | 'CONCEPT_CONFUSION' | 'EXCEPTION_MISSED' | 'APPLICATION_ERROR' | 'READING_ERROR' | 'INSUFFICIENT_INFORMATION';
  acceptableErrorTypes: string[];
  observability: 'CLEAR' | 'AMBIGUOUS' | 'UNOBSERVABLE';
  answerIndeterminate: 'YES' | 'NO';
  diagnosticIndeterminate: 'YES' | 'NO';
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  justification: string;
  promptInjectionCase: boolean;
  promptInjectionExpectedBehavior: string | null;
}

const VALID_ERROR_TYPES = [
  'KNOWLEDGE_GAP',
  'CONCEPT_CONFUSION',
  'EXCEPTION_MISSED',
  'APPLICATION_ERROR',
  'READING_ERROR',
  'INSUFFICIENT_INFORMATION'
];

const VALID_OBSERVABILITY = ['CLEAR', 'AMBIGUOUS', 'UNOBSERVABLE'];
const VALID_YES_NO = ['YES', 'NO'];
const VALID_CARD_DECISIONS = ['CREATE', 'NO_CARD'];

export function validateHoldoutV2AnnotationA(): { pass: boolean; errors: string[]; stats: Record<string, any> } {
  const errors: string[] = [];
  const annotationFilePath = path.resolve(__dirname, 'holdout-v2-annotation-a.json');

  if (!fs.existsSync(annotationFilePath)) {
    return { pass: false, errors: [`Arquivo de anotação não encontrado: ${annotationFilePath}`], stats: {} };
  }

  const rawAnnotation = fs.readFileSync(annotationFilePath, 'utf-8');
  let annotations: HoldoutV2AnnotationA[];
  try {
    annotations = JSON.parse(rawAnnotation);
  } catch (e: any) {
    return { pass: false, errors: [`Erro no parse JSON de annotation-a: ${e.message}`], stats: {} };
  }

  // 1. Quantidade total
  if (HOLDOUT_V2_CASES.length !== 120) {
    errors.push(`HOLDOUT_V2_CASES deve ter exatamente 120 casos. Encontrados: ${HOLDOUT_V2_CASES.length}`);
  }
  if (annotations.length !== 120) {
    errors.push(`holdout-v2-annotation-a deve ter exatamente 120 casos. Encontrados: ${annotations.length}`);
  }

  // 2. IDs V001..V120 e correspondência 1:1
  const expectedIds = Array.from({ length: 120 }, (_, i) => `V${String(i + 1).padStart(3, '0')}`);
  const caseIds = HOLDOUT_V2_CASES.map(c => c.id);
  const annotationIds = annotations.map(a => a.id);

  for (let i = 0; i < 120; i++) {
    if (caseIds[i] !== expectedIds[i]) {
      errors.push(`ID de caso na posição ${i} esperado ${expectedIds[i]}, encontrado ${caseIds[i]}`);
    }
    if (annotationIds[i] !== expectedIds[i]) {
      errors.push(`ID de anotação na posição ${i} esperado ${expectedIds[i]}, encontrado ${annotationIds[i]}`);
    }
  }

  // 3. Verificação de vazamento nos casos públicos
  for (const c of HOLDOUT_V2_CASES) {
    const keys = Object.keys(c);
    const allowedKeys = ['id', 'question', 'userAnswer', 'correctAnswer', 'officialExplanation'];
    for (const k of keys) {
      if (!allowedKeys.includes(k)) {
        errors.push(`Caso ${c.id} contém campo proibido no arquivo público: ${k}`);
      }
    }
    for (const ak of allowedKeys) {
      if (!(ak in c) || !(c as any)[ak]) {
        errors.push(`Caso ${c.id} não possui o campo obrigatório público: ${ak}`);
      }
    }
  }

  // Contadores
  const categoryCounts: Record<string, number> = {};
  const observabilityCounts: Record<string, number> = { CLEAR: 0, AMBIGUOUS: 0, UNOBSERVABLE: 0 };
  const cardCounts: Record<string, number> = { CREATE: 0, NO_CARD: 0 };
  let piCount = 0;
  let piCreate = 0;
  let piNoCard = 0;
  const piCategories: Record<string, number> = {};

  let answerYesDiagYes = 0; // Controle C
  let answerYesDiagNo = 0;  // Controle A
  let answerNoDiagYes = 0;  // Controle B
  let answerNoDiagNo = 0;   // Controle D

  let iiCreate = 0;
  let iiNoCard = 0;

  for (const a of annotations) {
    // Validação de enums e campos
    if (!VALID_ERROR_TYPES.includes(a.expectedErrorType)) {
      errors.push(`Caso ${a.id}: expectedErrorType inválido (${a.expectedErrorType})`);
    }
    if (!Array.isArray(a.acceptableErrorTypes) || !a.acceptableErrorTypes.includes(a.expectedErrorType)) {
      errors.push(`Caso ${a.id}: acceptableErrorTypes deve conter expectedErrorType`);
    }
    for (const aet of a.acceptableErrorTypes) {
      if (!VALID_ERROR_TYPES.includes(aet)) {
        errors.push(`Caso ${a.id}: acceptableErrorTypes contém tipo inválido (${aet})`);
      }
    }
    if (!VALID_OBSERVABILITY.includes(a.observability)) {
      errors.push(`Caso ${a.id}: observability inválida (${a.observability})`);
    }
    if (!VALID_YES_NO.includes(a.answerIndeterminate)) {
      errors.push(`Caso ${a.id}: answerIndeterminate inválido (${a.answerIndeterminate})`);
    }
    if (!VALID_YES_NO.includes(a.diagnosticIndeterminate)) {
      errors.push(`Caso ${a.id}: diagnosticIndeterminate inválido (${a.diagnosticIndeterminate})`);
    }
    if (!VALID_CARD_DECISIONS.includes(a.expectedCardDecision)) {
      errors.push(`Caso ${a.id}: expectedCardDecision inválida (${a.expectedCardDecision})`);
    }
    if (!a.justification || a.justification.trim().length < 10) {
      errors.push(`Caso ${a.id}: justification ausente ou muito curta`);
    }

    // Regra: UNOBSERVABLE => diagnosticIndeterminate=YES => INSUFFICIENT_INFORMATION
    if (a.observability === 'UNOBSERVABLE') {
      if (a.diagnosticIndeterminate !== 'YES') {
        errors.push(`Caso ${a.id}: UNOBSERVABLE exige diagnosticIndeterminate=YES`);
      }
      if (a.expectedErrorType !== 'INSUFFICIENT_INFORMATION') {
        errors.push(`Caso ${a.id}: UNOBSERVABLE exige expectedErrorType=INSUFFICIENT_INFORMATION`);
      }
    }

    // Regra: INSUFFICIENT_INFORMATION exige diagnosticIndeterminate=YES
    if (a.expectedErrorType === 'INSUFFICIENT_INFORMATION') {
      if (a.diagnosticIndeterminate !== 'YES') {
        errors.push(`Caso ${a.id}: INSUFFICIENT_INFORMATION exige diagnosticIndeterminate=YES`);
      }
      if (a.expectedCardDecision === 'CREATE') iiCreate++;
      if (a.expectedCardDecision === 'NO_CARD') iiNoCard++;
    }

    // Contadores
    categoryCounts[a.expectedErrorType] = (categoryCounts[a.expectedErrorType] || 0) + 1;
    observabilityCounts[a.observability] = (observabilityCounts[a.observability] || 0) + 1;
    cardCounts[a.expectedCardDecision] = (cardCounts[a.expectedCardDecision] || 0) + 1;

    // Quadrantes
    if (a.answerIndeterminate === 'YES' && a.diagnosticIndeterminate === 'YES') answerYesDiagYes++;
    if (a.answerIndeterminate === 'YES' && a.diagnosticIndeterminate === 'NO') answerYesDiagNo++;
    if (a.answerIndeterminate === 'NO' && a.diagnosticIndeterminate === 'YES') answerNoDiagYes++;
    if (a.answerIndeterminate === 'NO' && a.diagnosticIndeterminate === 'NO') answerNoDiagNo++;

    // Prompt injection
    if (a.promptInjectionCase) {
      piCount++;
      if (a.expectedCardDecision === 'CREATE') piCreate++;
      if (a.expectedCardDecision === 'NO_CARD') piNoCard++;
      piCategories[a.expectedErrorType] = (piCategories[a.expectedErrorType] || 0) + 1;
      if (!a.promptInjectionExpectedBehavior || a.promptInjectionExpectedBehavior.trim().length === 0) {
        errors.push(`Caso ${a.id}: promptInjectionCase=true exige promptInjectionExpectedBehavior preenchido`);
      }
    } else {
      if (a.promptInjectionExpectedBehavior !== null) {
        errors.push(`Caso ${a.id}: promptInjectionCase=false exige promptInjectionExpectedBehavior=null`);
      }
    }
  }

  // 4. Validação das 20 categorias
  for (const cat of VALID_ERROR_TYPES) {
    if (categoryCounts[cat] !== 20) {
      errors.push(`Categoria ${cat} deve ter exatamente 20 casos. Encontrados: ${categoryCounts[cat] || 0}`);
    }
  }

  // 5. Controles de Indeterminação
  // II = 20 casos, sendo 10 answer=NO / diag=YES (Controle B) e 10 answer=YES / diag=YES (Controle C)
  if (answerNoDiagYes !== 10) {
    errors.push(`Controle B (answerIndeterminate=NO / diagnosticIndeterminate=YES) deve ter exatamente 10 casos. Encontrados: ${answerNoDiagYes}`);
  }
  if (answerYesDiagYes !== 10) {
    errors.push(`Controle C (answerIndeterminate=YES / diagnosticIndeterminate=YES) deve ter exatamente 10 casos. Encontrados: ${answerYesDiagYes}`);
  }
  if (answerYesDiagNo < 10) {
    errors.push(`Controle A (answerIndeterminate=YES / diagnosticIndeterminate=NO) deve ter no mínimo 10 casos. Encontrados: ${answerYesDiagNo}`);
  }

  // 6. Balanceamento de Card
  if (cardCounts.CREATE < 40) {
    errors.push(`Total de CREATE deve ser >= 40. Encontrados: ${cardCounts.CREATE}`);
  }
  if (cardCounts.NO_CARD < 40) {
    errors.push(`Total de NO_CARD deve ser >= 40. Encontrados: ${cardCounts.NO_CARD}`);
  }
  if (iiCreate < 5) {
    errors.push(`II + CREATE deve ser >= 5. Encontrados: ${iiCreate}`);
  }
  if (iiNoCard < 5) {
    errors.push(`II + NO_CARD deve ser >= 5. Encontrados: ${iiNoCard}`);
  }

  // 7. Prompt Injection
  if (piCount !== 20) {
    errors.push(`Total de casos com prompt injection deve ser exatamente 20. Encontrados: ${piCount}`);
  }
  if (piCreate !== 10) {
    errors.push(`Prompt injection com CREATE deve ser exatamente 10. Encontrados: ${piCreate}`);
  }
  if (piNoCard !== 10) {
    errors.push(`Prompt injection com NO_CARD deve ser exatamente 10. Encontrados: ${piNoCard}`);
  }
  const piCategoryCount = Object.keys(piCategories).length;
  if (piCategoryCount < 5) {
    errors.push(`Prompt injection deve estar distribuída em pelo menos 5 categorias. Encontradas: ${piCategoryCount}`);
  }
  for (const [cat, count] of Object.entries(piCategories)) {
    if (count > 5) {
      errors.push(`Nenhuma categoria pode conter mais de 5 prompt injections. Categoria ${cat} tem ${count}`);
    }
  }

  const stats = {
    total: annotations.length,
    categoryCounts,
    observabilityCounts,
    quadrants: {
      answerYesDiagYes, // C
      answerYesDiagNo,  // A
      answerNoDiagYes,  // B
      answerNoDiagNo    // D
    },
    cardCounts,
    iiCard: {
      create: iiCreate,
      noCard: iiNoCard
    },
    promptInjection: {
      total: piCount,
      create: piCreate,
      noCard: piNoCard,
      categoriesCovered: piCategoryCount,
      categoryBreakdown: piCategories
    }
  };

  return {
    pass: errors.length === 0,
    errors,
    stats
  };
}

if (require.main === module) {
  const result = validateHoldoutV2AnnotationA();
  console.log('====================================================');
  console.log('RESULTADO DA VALIDAÇÃO ESTRUTURAL - HOLDOUT-V2 (A)');
  console.log('====================================================');
  console.log('PASS:', result.pass ? 'SIM (100% CONFORME)' : 'NÃO (FALHAS ENCONTRADAS)');
  if (!result.pass) {
    console.error('Erros encontrados:');
    result.errors.forEach(e => console.error(' -', e));
  } else {
    console.log(JSON.stringify(result.stats, null, 2));
  }
  console.log('====================================================');
}
