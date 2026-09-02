import { z } from 'zod';
import {
  CARD_ACTIONS,
  DISCIPLINES,
  EVIDENCE_SOURCES,
  EVIDENCE_SUPPORT_TYPES,
  LOW_CONFIDENCE_THRESHOLD,
  PROBABLE_ERROR_TYPES,
  USER_ATTRIBUTIONS,
  type EvidenceSource,
} from '@/config/ai';

/**
 * Remove marcação HTML/tags de um texto vindo do usuário.
 */
function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizedText(min: number, max: number, requiredMessage: string) {
  return z
    .string({ required_error: requiredMessage })
    .trim()
    .min(1, { message: requiredMessage })
    .transform(stripHtml)
    .pipe(
      z
        .string()
        .min(min, { message: `Deve ter pelo menos ${min} caracteres.` })
        .max(max, { message: `Não pode exceder ${max} caracteres.` })
    );
}

function optionalSanitizedText(max: number, maxMessage: string) {
  return z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z
      .string()
      .trim()
      .transform(stripHtml)
      .pipe(z.string().max(max, { message: maxMessage }))
      .optional()
  );
}

/**
 * Payload estruturado enviado pelo cliente na rota de análise anônima.
 */
export const anonymousAnalysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    userAttribution: z.enum(USER_ATTRIBUTIONS, {
      required_error: 'A autopercepção da causa do erro é obrigatória.',
    }),
    studentReasoning: optionalSanitizedText(
      2000,
      'O raciocínio do estudante não pode exceder 2000 caracteres.'
    ),
    turnstileToken: z.string().optional(),
  })
  .strict();

export type AnonymousAnalysisInput = z.infer<typeof anonymousAnalysisInputSchema>;

/**
 * Payload estruturado enviado pelo cliente na rota autenticada.
 */
export const authenticatedAnalysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    userAttribution: z.enum(USER_ATTRIBUTIONS).default('NAO_SEI'),
    studentReasoning: optionalSanitizedText(
      2000,
      'O raciocínio do estudante não pode exceder 2000 caracteres.'
    ),
  })
  .strict();

export type AuthenticatedAnalysisInput = z.infer<typeof authenticatedAnalysisInputSchema>;

/**
 * Input fornecido ao Adapter do Gemini.
 * PROIBIDO incluir userAttribution, user_id, turnstile, email ou dados de identidade.
 */
export const analysisInputSchema = z
  .object({
    question: sanitizedText(5, 4000, 'A questão é obrigatória.'),
    userAnswer: sanitizedText(1, 2000, 'A resposta dada é obrigatória.'),
    correctAnswer: sanitizedText(1, 2000, 'O gabarito/resposta correta é obrigatório.'),
    studentReasoning: optionalSanitizedText(
      2000,
      'O raciocínio do estudante não pode exceder 2000 caracteres.'
    ),
  })
  .strict();

export type AnalysisInput = z.infer<typeof analysisInputSchema>;

/** Validação do header Idempotency-Key: obrigatoriamente um UUID. */
export const idempotencyKeySchema = z.string().uuid({ message: 'Idempotency-Key deve ser um UUID válido.' });

/** Validação do payload de Claim de análise pendente. */
export const claimPendingSchema = z
  .object({
    claimToken: z.string().min(16, 'Token de resgate inválido.'),
  })
  .strict();

export type ClaimPendingInput = z.infer<typeof claimPendingSchema>;

/** Frente/verso de um flashcard gerado. */
export const flashcardSchema = z.object({
  front: z.string().trim().min(1, 'Frente do card muito curta.').max(500, 'Frente do card muito longa.'),
  back: z.string().trim().min(1, 'Verso do card muito curto.').max(1500, 'Verso do card muito longo.'),
});

export type Flashcard = z.infer<typeof flashcardSchema>;

/**
 * Evidência diagnóstica estruturada (desde analysis-v2.3, estendida em v2.4 com
 * `supportType`). Declaração do próprio modelo sobre se há evidência observável
 * suficiente para uma atribuição causal — NÃO é, por si só, uma garantia:
 * `sufficient` e `supportType` são apenas o autorrelato do modelo. A garantia real
 * vem da verificação determinística em `enforceDiagnosticInvariants` abaixo, que
 * confere se `evidenceQuote` realmente existe, literalmente, no campo
 * `evidenceSource` declarado. `competingCauses` é mantido apenas para
 * auditoria/benchmark/telemetria — NÃO é usado como gatilho determinístico.
 *
 * GROUNDING != DIAGNOSTIC SUPPORT (analysis-v2.4): grounding (verificado por
 * `isDiagnosticEvidenceGrounded`) responde "a evidência citada existe de fato?" —
 * uma checagem 100% mecânica de string. `supportType` responde "que tipo de
 * suporte diagnóstico ela representa?" — um julgamento do modelo, auditável mas
 * não uma prova determinística de que a causa está correta.
 */
const diagnosticEvidenceSchema = z.object({
  sufficient: z.boolean(),
  evidenceSource: z.enum(EVIDENCE_SOURCES).nullable(),
  evidenceQuote: z.string().trim().max(500, 'evidenceQuote deve ser uma citação curta.').nullable(),
  supportType: z.enum(EVIDENCE_SUPPORT_TYPES),
  competingCauses: z.array(z.enum(PROBABLE_ERROR_TYPES)).max(PROBABLE_ERROR_TYPES.length).default([]),
});

export type DiagnosticEvidence = z.infer<typeof diagnosticEvidenceSchema>;

const outputBaseFields = {
  discipline: z.enum(DISCIPLINES),
  // observableBehavior e diagnosticEvidence devem aparecer no schema ANTES de
  // probableErrorType: a ordem das propriedades aqui espelha a ordem de
  // `properties` em GEMINI_RESPONSE_SCHEMA (gemini.ts) — uma decomposição
  // diagnóstica estruturada (não uma "chain-of-thought") que faz o modelo se
  // comprometer com o erro observado e a suficiência da evidência ANTES de
  // emitir a causa escolhida, dentro da MESMA chamada (sem custo de uma segunda
  // chamada ao Gemini). Opcionais para preservar compatibilidade com prompts e
  // benchmarks anteriores ao v2.4, que não os produzem.
  observableBehavior: z.string().trim().min(1).max(1000).optional(),
  diagnosticEvidence: diagnosticEvidenceSchema.optional(),
  probableErrorType: z.enum(PROBABLE_ERROR_TYPES),
  confidence: z.number().min(0, 'confidence mínimo é 0.0').max(1, 'confidence máximo é 1.0'),
  reasoningSummary: z
    .string()
    .trim()
    .min(10, 'reasoningSummary muito curto.')
    .max(600, 'reasoningSummary deve ser uma justificativa curta.'),
  recommendedAction: z
    .string()
    .trim()
    .min(10, 'recommendedAction muito curta.')
    .max(600, 'recommendedAction deve ser uma conduta prática.'),
  coreConcept: z.string().trim().min(2).max(200),
};

/**
 * Output estruturado do Gemini. Discriminated union por cardAction:
 *   - cardAction = NO_CARD           => card = null
 *   - cardAction = CREATE_*          => card != null (front/back obrigatórios)
 */
export const analysisOutputSchema = z.discriminatedUnion('cardAction', [
  z.object({ ...outputBaseFields, cardAction: z.literal('NO_CARD'), card: z.null() }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_BASIC_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_DISCRIMINATION_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_EXCEPTION_CARD'), card: flashcardSchema }),
  z.object({ ...outputBaseFields, cardAction: z.literal('CREATE_APPLICATION_CARD'), card: flashcardSchema }),
]);

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

const EVIDENCE_SOURCE_FIELD: Record<EvidenceSource, keyof AnalysisInput> = {
  QUESTION: 'question',
  USER_ANSWER: 'userAnswer',
  CORRECT_ANSWER: 'correctAnswer',
  STUDENT_REASONING: 'studentReasoning',
};

/** Normalização mínima e segura: trim + colapso de espaços + minúsculas. Sem regex de linguagem natural. */
function normalizeForGroundingCheck(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Barreira estritamente estrutural contra respostas sem conteúdo causal, como
 * "A", "sim", "não", um número ou um termo isolado. Não tenta decidir se o
 * texto é pedagogicamente suficiente; esse julgamento permanece no modelo.
 */
function isStructurallySubstantiveUserAnswer(value: string): boolean {
  const lexicalTokens = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  return value.length >= 12 && lexicalTokens.length >= 3;
}

/**
 * Verificação puramente MECÂNICA de grounding — nunca interpreta relevância pedagógica,
 * apenas fatos objetivos e verificáveis por comparação de string:
 *   1. evidenceSource aponta para um dos 4 campos reais de entrada;
 *   2. esse campo realmente existe (ex.: STUDENT_REASONING quando studentReasoning foi
 *      fornecido);
 *   3. evidenceQuote, depois de normalizado, aparece literalmente como substring do
 *      campo declarado (nunca fabricado);
 *   4. uma reprodução integral de userAnswer só é aceita quando o campo tem estrutura
 *      textual minimamente substantiva; respostas curtas/triviais continuam rejeitadas.
 *      A reprodução integral de correctAnswer continua sempre rejeitada.
 * A relevância pedagógica da citação (ela realmente explicar a causa) continua sendo
 * julgamento do modelo — este código não tenta reproduzir esse julgamento.
 */
export function isDiagnosticEvidenceGrounded(input: AnalysisInput, evidence: DiagnosticEvidence): boolean {
  if (!evidence.evidenceSource || !evidence.evidenceQuote) {
    return false;
  }

  const fieldKey = EVIDENCE_SOURCE_FIELD[evidence.evidenceSource];
  const fieldValue = input[fieldKey];
  if (!fieldValue) {
    return false;
  }

  const normalizedField = normalizeForGroundingCheck(fieldValue);
  const normalizedQuote = normalizeForGroundingCheck(evidence.evidenceQuote);

  if (normalizedQuote.length === 0 || !normalizedField.includes(normalizedQuote)) {
    return false;
  }

  const isEntireCorrectAnswerReproduction =
    evidence.evidenceSource === 'CORRECT_ANSWER' && normalizedQuote === normalizedField;
  const isTrivialUserAnswerReproduction =
    evidence.evidenceSource === 'USER_ANSWER' &&
    normalizedQuote === normalizedField &&
    !isStructurallySubstantiveUserAnswer(normalizedField);

  return !isEntireCorrectAnswerReproduction && !isTrivialUserAnswerReproduction;
}

const FALLBACK_RECOMMENDED_ACTION =
  'Revise o enunciado e o gabarito oficial com atenção para identificar os pontos de dúvida específicos.';

/**
 * Função pura e ÚNICA responsável por produzir o output final coerente (analysis-v2.5).
 * Substitui os antigos `applyLowConfidencePolicy` + `applyDiagnosticEvidencePolicy`
 * (analysis-v2.2/v2.3) — duas policies independentes cuja ordem de composição podia,
 * em tese, produzir estados contraditórios. Aqui existe um único fluxo determinístico:
 *
 *   Gemini -> validação de schema (zod) -> enforceDiagnosticInvariants -> output final
 *
 * Garante estas invariantes do domínio (nunca dependem do texto do prompt):
 *
 *   INVARIANTE 1: diagnosticEvidence.sufficient === false
 *                 => probableErrorType = INSUFFICIENT_INFORMATION, cardAction = NO_CARD, card = null
 *                 (mesmo que o modelo tenha, inconsistentemente, escolhido uma causa
 *                 específica — esse estado nunca sobrevive ao output final).
 *   INVARIANTE 2: probableErrorType === INSUFFICIENT_INFORMATION
 *                 => cardAction = NO_CARD, card = null
 *   INVARIANTE 3: probableErrorType !== INSUFFICIENT_INFORMATION
 *                 => diagnosticEvidence.sufficient === true
 *                 (pós-condição garantida por construção: só chegamos a uma causa
 *                 específica no retorno se a Invariante 1 não disparou, ou seja, se
 *                 sufficient já era true).
 *   INVARIANTE 4: uma causa específica exige evidência GROUNDED (ver
 *                 isDiagnosticEvidenceGrounded) — sufficient=true com citação
 *                 fabricada/ausente/de fonte errada/reprodução trivial da resposta é
 *                 rebaixado para INSUFFICIENT_INFORMATION/NO_CARD.
 *   INVARIANTE 5: confidence < LOW_CONFIDENCE_THRESHOLD
 *                 => INSUFFICIENT_INFORMATION, NO_CARD, card = null.
 *   INVARIANTE 6 (analysis-v2.5): evidenceSource === 'QUESTION'
 *                 => nunca sustenta sozinho uma causa cognitiva específica, mesmo com
 *                 sufficient=true e citação grounded — rebaixado para
 *                 INSUFFICIENT_INFORMATION/NO_CARD. Decisão de política geral, não
 *                 específica de disciplina: nasceu do achado empírico do holdout-v24
 *                 (BD03) em que uma resposta numericamente compatível com os dados do
 *                 próprio enunciado foi tratada como "procedimento observável" sem
 *                 nenhum passo real ter sido citado.
 *   INVARIANTE 7 (analysis-v2.5): probableErrorType === 'READING_ERROR'
 *                 => cardAction sempre NO_CARD, card sempre null — mesmo quando
 *                 sufficient=true, grounded e confidence alta, e mesmo quando o
 *                 relato descreve um padrão de leitura recorrente. Decisão de
 *                 política pedagógica geral (não uma correção pontual de caso):
 *                 recorrência deve influenciar recommendedAction, nunca justificar um
 *                 flashcard de conteúdo. Ao contrário das Invariantes 1/2/4/5/6, esta
 *                 NUNCA rebaixa probableErrorType — só cardAction/card.
 *
 * `supportType` (EXPLICIT_REASONING_CONFIRMATION / OBSERVABLE_PROCEDURE /
 * EXPLICIT_TEXTUAL_TRIGGER / NONE) é produzido pelo modelo para tornar a decisão
 * auditável, mas NÃO é usado aqui como prova determinística — apenas `sufficient`
 * (autorrelato), `evidenceSource` (fato estrutural) e o grounding mecânico (fato
 * verificável) têm esse papel. Quando `diagnosticEvidence` estiver ausente
 * (compatibilidade com prompts/benchmarks anteriores ao v2.3), as Invariantes 1/4/6
 * são puladas e só as Invariantes 2/5/7 se aplicam, preservando o comportamento
 * histórico sem exigir campos que não existiam.
 */
export function enforceDiagnosticInvariants(input: AnalysisInput, output: AnalysisOutput): AnalysisOutput {
  const downgradeToInsufficientInformation = (): AnalysisOutput => ({
    ...output,
    probableErrorType: 'INSUFFICIENT_INFORMATION',
    cardAction: 'NO_CARD',
    card: null,
    recommendedAction: output.recommendedAction || FALLBACK_RECOMMENDED_ACTION,
  });

  const evidence = output.diagnosticEvidence;

  // INVARIANTE 1: autorrelato de insuficiência é sempre respeitado, independentemente
  // de qual probableErrorType o modelo tenha (inconsistentemente) escolhido.
  if (evidence !== undefined && evidence.sufficient === false) {
    return downgradeToInsufficientInformation();
  }

  // INVARIANTE 6: QUESTION sozinho nunca sustenta uma causa cognitiva específica,
  // independentemente de estar grounded — política geral, não por disciplina.
  if (evidence !== undefined && evidence.sufficient === true && evidence.evidenceSource === 'QUESTION') {
    return downgradeToInsufficientInformation();
  }

  // INVARIANTE 4: sufficient=true exige evidência realmente grounded; caso contrário,
  // o autorrelato positivo não é suficiente para sustentar uma causa específica.
  if (evidence !== undefined && evidence.sufficient === true && !isDiagnosticEvidenceGrounded(input, evidence)) {
    return downgradeToInsufficientInformation();
  }

  // INVARIANTE 5: confidence abaixo do limiar conservador.
  if (output.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return downgradeToInsufficientInformation();
  }

  // INVARIANTE 2: o próprio modelo já declarou INSUFFICIENT_INFORMATION diretamente —
  // garante NO_CARD/card=null mesmo que o modelo tenha (incorretamente) preenchido um card.
  if (output.probableErrorType === 'INSUFFICIENT_INFORMATION') {
    return downgradeToInsufficientInformation();
  }

  // INVARIANTE 7: READING_ERROR nunca gera card, mesmo com recorrência declarada.
  // Ao contrário das demais, não rebaixa probableErrorType — só cardAction/card.
  if (output.probableErrorType === 'READING_ERROR' && (output.cardAction !== 'NO_CARD' || output.card !== null)) {
    return { ...output, cardAction: 'NO_CARD', card: null };
  }

  // INVARIANTE 3 é uma pós-condição garantida pelas checagens acima, não uma checagem
  // adicional: se chegamos aqui, sufficient é true (ou diagnosticEvidence está ausente),
  // grounded, confidence suficiente e probableErrorType != INSUFFICIENT_INFORMATION.
  return output;
}
