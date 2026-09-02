/**
 * CONGELADO — EXECUÇÃO ÚNICA E SELADA do holdout-v23-blind contra o analysis-v2.3,
 * já realizada em 2026-09-02 (ver holdout-v23-blind-run-results.json). Resultado
 * formal: VALIDAÇÃO CEGA: FAIL. Este arquivo é preservado como registro histórico
 * imutável do que REALMENTE rodou — NÃO deve ser reexecutado, e NÃO foi atualizado
 * para usar analysis-v2.4 (isso seria reescrever a história do benchmark).
 *
 * Por isso este script é AUTOCONTIDO: em vez de importar ANALYSIS_SYSTEM_PROMPT/
 * GEMINI_RESPONSE_SCHEMA/enforceDiagnosticInvariants do módulo de produção ATIVO
 * (que agora é v2.4), importa o prompt já congelado em analysis-prompt-v2-3.ts e
 * reimplementa localmente o schema e a política determinística exatamente como
 * existiam quando este benchmark foi executado — para nunca quebrar de novo por
 * causa de uma evolução legítima do contrato ativo, e para nunca fingir que o v2.3
 * usou mecanismos do v2.4.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { z } from 'zod';
import { HOLDOUT_V23_BLIND_CASES } from './holdout-v23-blind-cases';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, PROMPT_VERSION, type AnalysisV23Input } from '../../src/lib/ai/analysis-prompt-v2-3';
import { DISCIPLINES, EVIDENCE_SOURCES, PROBABLE_ERROR_TYPES, CARD_ACTIONS, AI_MODEL, AI_REQUEST_TIMEOUT_MS } from '../../src/config/ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY ausente em .env.local — abortando execução.');
  process.exit(1);
}

const TEMPERATURE = 0.2; // idêntico a gemini.ts:callGeminiOnce no momento da execução original

// --- Cópia congelada do schema/política tal como existiam em analysis-v2.3 ---

const GEMINI_RESPONSE_SCHEMA_V23 = {
  type: 'OBJECT',
  properties: {
    discipline: { type: 'STRING', enum: DISCIPLINES },
    diagnosticEvidence: {
      type: 'OBJECT',
      properties: {
        sufficient: { type: 'BOOLEAN' },
        evidenceQuote: { type: 'STRING', nullable: true },
        evidenceSource: { type: 'STRING', enum: EVIDENCE_SOURCES, nullable: true },
        competingCauses: { type: 'ARRAY', items: { type: 'STRING', enum: PROBABLE_ERROR_TYPES } },
      },
      required: ['sufficient', 'evidenceQuote', 'evidenceSource', 'competingCauses'],
    },
    probableErrorType: { type: 'STRING', enum: PROBABLE_ERROR_TYPES },
    confidence: { type: 'NUMBER' },
    reasoningSummary: { type: 'STRING' },
    recommendedAction: { type: 'STRING' },
    coreConcept: { type: 'STRING' },
    cardAction: { type: 'STRING', enum: CARD_ACTIONS },
    card: {
      type: 'OBJECT',
      nullable: true,
      properties: { front: { type: 'STRING' }, back: { type: 'STRING' } },
      required: ['front', 'back'],
    },
  },
  required: ['discipline', 'probableErrorType', 'confidence', 'reasoningSummary', 'recommendedAction', 'coreConcept', 'cardAction', 'card'],
} as const;

const flashcardSchemaV23 = z.object({ front: z.string(), back: z.string() });
const diagnosticEvidenceSchemaV23 = z.object({
  sufficient: z.boolean(),
  evidenceQuote: z.string().nullable(),
  evidenceSource: z.enum(EVIDENCE_SOURCES).nullable(),
  competingCauses: z.array(z.enum(PROBABLE_ERROR_TYPES)).default([]),
});
const outputBaseFieldsV23 = {
  discipline: z.enum(DISCIPLINES),
  diagnosticEvidence: diagnosticEvidenceSchemaV23.optional(),
  probableErrorType: z.enum(PROBABLE_ERROR_TYPES),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string(),
  recommendedAction: z.string(),
  coreConcept: z.string(),
};
const analysisOutputSchemaV23 = z.discriminatedUnion('cardAction', [
  z.object({ ...outputBaseFieldsV23, cardAction: z.literal('NO_CARD'), card: z.null() }),
  z.object({ ...outputBaseFieldsV23, cardAction: z.literal('CREATE_BASIC_CARD'), card: flashcardSchemaV23 }),
  z.object({ ...outputBaseFieldsV23, cardAction: z.literal('CREATE_DISCRIMINATION_CARD'), card: flashcardSchemaV23 }),
  z.object({ ...outputBaseFieldsV23, cardAction: z.literal('CREATE_EXCEPTION_CARD'), card: flashcardSchemaV23 }),
  z.object({ ...outputBaseFieldsV23, cardAction: z.literal('CREATE_APPLICATION_CARD'), card: flashcardSchemaV23 }),
]);
type AnalysisOutput = z.infer<typeof analysisOutputSchemaV23>;

const LOW_CONFIDENCE_THRESHOLD_V23 = 0.6;
const EVIDENCE_SOURCE_FIELD_V23: Record<string, keyof AnalysisV23Input> = {
  QUESTION: 'question',
  USER_ANSWER: 'userAnswer',
  CORRECT_ANSWER: 'correctAnswer',
  STUDENT_REASONING: 'studentReasoning',
};

function normalizeV23(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isDiagnosticEvidenceGroundedV23(input: AnalysisV23Input, evidence: NonNullable<AnalysisOutput['diagnosticEvidence']>): boolean {
  if (!evidence.evidenceSource || !evidence.evidenceQuote) return false;
  const fieldValue = input[EVIDENCE_SOURCE_FIELD_V23[evidence.evidenceSource]];
  if (!fieldValue) return false;
  const normalizedField = normalizeV23(fieldValue);
  const normalizedQuote = normalizeV23(evidence.evidenceQuote);
  if (normalizedQuote.length === 0 || !normalizedField.includes(normalizedQuote)) return false;
  const isTrivial = (evidence.evidenceSource === 'USER_ANSWER' || evidence.evidenceSource === 'CORRECT_ANSWER') && normalizedQuote === normalizedField;
  return !isTrivial;
}

function applyDiagnosticEvidencePolicyV23(input: AnalysisV23Input, output: AnalysisOutput): AnalysisOutput {
  const evidence = output.diagnosticEvidence;
  const claimsSufficientButUngrounded = evidence !== undefined && evidence.sufficient === true && !isDiagnosticEvidenceGroundedV23(input, evidence);
  const applyLowConfidence = (o: AnalysisOutput): AnalysisOutput => {
    if (o.confidence >= LOW_CONFIDENCE_THRESHOLD_V23 && o.probableErrorType !== 'INSUFFICIENT_INFORMATION') return o;
    return { ...o, probableErrorType: 'INSUFFICIENT_INFORMATION', cardAction: 'NO_CARD', card: null };
  };
  if (claimsSufficientButUngrounded) {
    return { ...output, probableErrorType: 'INSUFFICIENT_INFORMATION', cardAction: 'NO_CARD', card: null };
  }
  return applyLowConfidence(output);
}

interface RawResult {
  caseId: string;
  ok: boolean;
  errorMessage?: string;
  rawText?: string;
  raw?: AnalysisOutput;
  final?: AnalysisOutput;
  policyIntervention: boolean;
  policyReason?: string;
  latencyMs: number;
}

async function callOnce(userPrompt: string): Promise<{ text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(AI_MODEL)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_RESPONSE_SCHEMA_V23,
          },
        }),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    }
    const json = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('Resposta vazia do Gemini.');
    return { text };
  } finally {
    clearTimeout(timer);
  }
}

function describePolicyReason(input: { question: string; userAnswer: string; correctAnswer: string; studentReasoning?: string }, raw: AnalysisOutput, final: AnalysisOutput): string {
  if (raw.confidence < 0.6 && raw.probableErrorType !== 'INSUFFICIENT_INFORMATION') {
    return `confidence bruta ${raw.confidence} < 0.6 (LOW_CONFIDENCE_THRESHOLD)`;
  }
  if (raw.probableErrorType === 'INSUFFICIENT_INFORMATION' && raw.cardAction !== 'NO_CARD') {
    return 'probableErrorType bruto já era INSUFFICIENT_INFORMATION, mas cardAction/card não estavam em conformidade';
  }
  const ev = raw.diagnosticEvidence;
  if (ev && ev.sufficient === true) {
    return 'diagnosticEvidence.sufficient=true, mas evidenceQuote/evidenceSource não passou na verificação de grounding (fabricada, ausente, fonte errada, ou reprodução trivial de userAnswer/correctAnswer)';
  }
  return 'motivo não determinado automaticamente pelo script (revisar manualmente)';
}

async function main() {
  console.log(`Execução única do holdout-v23-blind contra ${PROMPT_VERSION}, modelo ${AI_MODEL}, iniciada em ${new Date().toISOString()}`);
  const results: RawResult[] = [];

  for (const c of HOLDOUT_V23_BLIND_CASES) {
    const input = {
      question: c.question,
      userAnswer: c.userAnswer,
      correctAnswer: c.correctAnswer,
      ...(c.studentReasoning ? { studentReasoning: c.studentReasoning } : {}),
    };
    const userPrompt = buildAnalysisUserPrompt(input);
    const startedAt = Date.now();
    try {
      const { text } = await callOnce(userPrompt);
      const parsed = JSON.parse(text);
      const validation = analysisOutputSchemaV23.safeParse(parsed);
      if (!validation.success) {
        results.push({
          caseId: c.id,
          ok: false,
          errorMessage: `SCHEMA_INVALID: ${validation.error.message}`,
          rawText: text,
          policyIntervention: false,
          latencyMs: Date.now() - startedAt,
        });
        continue;
      }
      const raw = validation.data;
      const final = applyDiagnosticEvidencePolicyV23(input, raw);
      const intervened = JSON.stringify(raw) !== JSON.stringify(final);
      results.push({
        caseId: c.id,
        ok: true,
        raw,
        final,
        policyIntervention: intervened,
        policyReason: intervened ? describePolicyReason(input, raw, final) : undefined,
        latencyMs: Date.now() - startedAt,
      });
      console.log(`  ${c.id} OK (${Date.now() - startedAt}ms)${intervened ? ' [POLICY INTERVENED]' : ''}`);
    } catch (err) {
      results.push({
        caseId: c.id,
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
        policyIntervention: false,
        latencyMs: Date.now() - startedAt,
      });
      console.log(`  ${c.id} ERRO: ${err instanceof Error ? err.message : err}`);
    }
  }

  const outPath = path.resolve(__dirname, 'holdout-v23-blind-run-results.json');
  writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nTodos os 30 casos concluídos. Resultados brutos salvos em ${outPath}`);
  console.log(`Execução finalizada em ${new Date().toISOString()}`);
}

main();
