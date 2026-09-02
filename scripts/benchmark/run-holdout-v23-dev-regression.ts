/**
 * DEVELOPMENT REGRESSION (NÃO é validação cega) — roda os 30 casos de
 * holdout-v23-blind-cases.ts contra o contrato ATIVO (analysis-v2.5).
 *
 * IMPORTANTE: holdout-v23-blind deixou de ser holdout cego a partir do momento em
 * que o analysis-v2.3 foi executado contra ele (ver holdout-v23-blind-run-results.json,
 * VALIDAÇÃO CEGA: FAIL). A partir de agora ele só pode ser usado como dataset de
 * desenvolvimento/regressão — NUNCA mais como validação cega de uma versão nova.
 *
 * Reaproveita o código de produção ATIVO sem alterá-lo: ANALYSIS_SYSTEM_PROMPT,
 * buildAnalysisUserPrompt, GEMINI_RESPONSE_SCHEMA, analysisOutputSchema,
 * enforceDiagnosticInvariants — todos importados de src/lib/ai, não duplicados.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { HOLDOUT_V23_BLIND_CASES } from './holdout-v23-blind-cases';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, PROMPT_VERSION } from '../../src/lib/ai/analysis-prompt';
import { GEMINI_RESPONSE_SCHEMA } from '../../src/lib/ai/gemini';
import { analysisOutputSchema, enforceDiagnosticInvariants, type AnalysisOutput, type AnalysisInput } from '../../src/lib/ai/analysis-schema';
import { AI_MODEL, AI_REQUEST_TIMEOUT_MS, LOW_CONFIDENCE_THRESHOLD } from '../../src/config/ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY ausente em .env.local — abortando execução.');
  process.exit(1);
}

const TEMPERATURE = 0.2;

interface RegressionResult {
  caseId: string;
  ok: boolean;
  errorMessage?: string;
  raw?: AnalysisOutput;
  final?: AnalysisOutput;
  policyIntervention: boolean;
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
            responseSchema: GEMINI_RESPONSE_SCHEMA,
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

async function main() {
  console.log(`### DEVELOPMENT REGRESSION (NÃO é validação cega) ###`);
  const startedAtIso = new Date().toISOString();
  console.log(`promptVersion=${PROMPT_VERSION} modelo=${AI_MODEL} iniciado em ${startedAtIso}`);
  const results: RegressionResult[] = [];

  for (const c of HOLDOUT_V23_BLIND_CASES) {
    const input: AnalysisInput = {
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
      const validation = analysisOutputSchema.safeParse(parsed);
      if (!validation.success) {
        results.push({ caseId: c.id, ok: false, errorMessage: `SCHEMA_INVALID: ${validation.error.message}`, policyIntervention: false, latencyMs: Date.now() - startedAt });
        console.log(`  ${c.id} SCHEMA_INVALID`);
        continue;
      }
      const raw = validation.data;
      const final = enforceDiagnosticInvariants(input, raw);
      const intervened = JSON.stringify(raw) !== JSON.stringify(final);
      results.push({ caseId: c.id, ok: true, raw, final, policyIntervention: intervened, latencyMs: Date.now() - startedAt });
      console.log(`  ${c.id} OK (${Date.now() - startedAt}ms)${intervened ? ' [POLICY INTERVENED]' : ''}`);
    } catch (err) {
      results.push({ caseId: c.id, ok: false, errorMessage: err instanceof Error ? err.message : String(err), policyIntervention: false, latencyMs: Date.now() - startedAt });
      console.log(`  ${c.id} ERRO: ${err instanceof Error ? err.message : err}`);
    }
  }

  const finishedAtIso = new Date().toISOString();
  const output = {
    instrument: 'holdout-v23-blind (DEVELOPMENT REGRESSION — não é holdout cego)',
    model: AI_MODEL,
    promptVersion: PROMPT_VERSION,
    temperature: TEMPERATURE,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    startedAt: startedAtIso,
    finishedAt: finishedAtIso,
    caseCount: HOLDOUT_V23_BLIND_CASES.length,
    results,
  };
  const outPath = path.resolve(__dirname, 'holdout-v23-dev-regression-v25-results.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nResultados salvos em ${outPath}`);
  console.log(`Finalizado em ${finishedAtIso}`);
}

main();
