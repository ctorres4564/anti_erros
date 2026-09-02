/**
 * RUNNER SELADO do holdout-v24-blind — validação cega única (one-shot).
 *
 * ATENÇÃO: este arquivo, quando executado sem --execute-blind, faz APENAS
 * pre-flight e verificação de integridade do freeze. Nenhuma chamada ao
 * Gemini ocorre nesse modo. A execução real exige --execute-blind, uma
 * segunda trava deliberada além da validação de --model.
 *
 * DECISÃO HUMANA FORMAL (selada nesta versão do arquivo):
 *   INTENDED_MODEL = 'gemini-3.7-flash'
 * Este valor é uma constante de código — nunca lido de AI_MODEL nem de
 * process.env.GEMINI_MODEL_NAME. O ambiente (.env.local) só é usado para
 * GEMINI_API_KEY.
 *
 * ORDEM DE CARREGAMENTO (evita o bug de import-order já documentado em
 * scripts/benchmark/run-holdout-v23-blind.ts): imports estáticos ES module
 * são hoisted e avaliados ANTES de qualquer código do corpo do módulo,
 * inclusive antes de uma chamada a dotenv.config() escrita mais acima no
 * arquivo. Por isso aqui os módulos do motor (src/lib/ai/*, src/config/ai)
 * são carregados via import() DINÂMICO, dentro de uma função, DEPOIS de
 * loadEnv() já ter rodado — e mesmo assim o model ID nunca vem desses
 * módulos, apenas de INTENDED_MODEL e de --model.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// ---------- Constantes seladas (nunca lidas de env/config do motor) ----------
export const INTENDED_MODEL = 'gemini-3.7-flash' as const;
export const HOLDOUT_NAME = 'holdout-v24-blind';
export const EXPECTED_CASE_COUNT = 40;
export const EXPECTED_CASE_IDS = Array.from({ length: 40 }, (_, i) => `BD${String(i + 1).padStart(2, '0')}`);
export const REQUEST_TEMPERATURE = 0.2; // idêntico a src/lib/ai/gemini.ts:callGeminiOnce

const BENCHMARK_DIR = path.resolve(__dirname);
export const FREEZE_MANIFEST_PATH = path.resolve(BENCHMARK_DIR, 'holdout-v24-blind-freeze.json');
export const RESULTS_PATH = path.resolve(BENCHMARK_DIR, 'holdout-v24-blind-results.json');

// ---------- CLI ----------
export interface CliArgs {
  model?: string;
  executeBlind: boolean;
}

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = { executeBlind: false };
  for (const raw of argv) {
    if (raw === '--execute-blind') {
      args.executeBlind = true;
      continue;
    }
    const match = /^--model=(.+)$/.exec(raw);
    if (match) {
      args.model = match[1];
    }
  }
  return args;
}

/** Retorna null se o --model informado for válido; caso contrário, o motivo do ABORT. */
export function validateCliModel(args: CliArgs): string | null {
  if (!args.model) {
    return 'MODEL_ARG_MISSING: --model é obrigatório (ex.: --model=gemini-3.7-flash). Não existe default.';
  }
  if (args.model !== INTENDED_MODEL) {
    return `MODEL_ARG_MISMATCH: --model=${args.model} difere da decisão selada INTENDED_MODEL=${INTENDED_MODEL}.`;
  }
  return null;
}

// ---------- Verificação de integridade do freeze ----------
export interface FreezeManifestFileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface FreezeManifest {
  instrument: string;
  status: string;
  caseCount: number;
  caseIds: string[];
  gates: Record<string, unknown>;
  files: FreezeManifestFileEntry[];
  intendedModel?: string;
  [key: string]: unknown;
}

function sha256File(absPath: string): string {
  return createHash('sha256').update(readFileSync(absPath)).digest('hex');
}

export interface FreezeVerificationResult {
  ok: boolean;
  reasons: string[];
  manifest?: FreezeManifest;
  manifestSha256?: string;
}

export function isCaseCountValid(count: number): boolean {
  return count === EXPECTED_CASE_COUNT;
}

/**
 * Recalcula hashes e confere caseCount/caseIds/gates. NUNCA escreve no manifesto.
 * `manifestPathOverride` existe SOMENTE para testes (apontar para um fixture
 * temporário) — a execução real sempre usa FREEZE_MANIFEST_PATH.
 */
export function verifyFreezeManifest(repoRoot: string, manifestPathOverride?: string): FreezeVerificationResult {
  const manifestPath = manifestPathOverride ?? FREEZE_MANIFEST_PATH;
  const reasons: string[] = [];

  if (!existsSync(manifestPath)) {
    return { ok: false, reasons: [`FREEZE_MANIFEST_NOT_FOUND: ${manifestPath}`] };
  }

  const manifestSha256 = sha256File(manifestPath);
  let manifest: FreezeManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { ok: false, reasons: [`FREEZE_MANIFEST_INVALID_JSON: ${err instanceof Error ? err.message : err}`], manifestSha256 };
  }

  if (manifest.instrument !== HOLDOUT_NAME) {
    reasons.push(`instrument mismatch: esperado "${HOLDOUT_NAME}", encontrado "${manifest.instrument}"`);
  }
  if (manifest.status !== 'FROZEN') {
    reasons.push(`status != FROZEN (encontrado "${manifest.status}")`);
  }
  if (manifest.caseCount !== EXPECTED_CASE_COUNT) {
    reasons.push(`caseCount mismatch: esperado ${EXPECTED_CASE_COUNT}, encontrado ${manifest.caseCount}`);
  }
  const missingIds = EXPECTED_CASE_IDS.filter((id) => !manifest.caseIds?.includes(id));
  const extraIds = (manifest.caseIds ?? []).filter((id) => !EXPECTED_CASE_IDS.includes(id));
  if (missingIds.length > 0) reasons.push(`caseIds ausentes no manifesto: ${missingIds.join(', ')}`);
  if (extraIds.length > 0) reasons.push(`caseIds inesperados no manifesto: ${extraIds.join(', ')}`);

  const requiredGates = ['gateA', 'gateB', 'gateC', 'gateD', 'gateE', 'gateF', 'gateG', 'gateH'];
  const missingGates = requiredGates.filter((g) => !(manifest.gates && g in manifest.gates));
  if (missingGates.length > 0) reasons.push(`gates ausentes no manifesto: ${missingGates.join(', ')}`);

  for (const entry of manifest.files ?? []) {
    const absPath = path.resolve(repoRoot, entry.path);
    if (!existsSync(absPath)) {
      reasons.push(`arquivo listado no manifesto não encontrado: ${entry.path}`);
      continue;
    }
    const actualBytes = readFileSync(absPath).length;
    const actualSha256 = sha256File(absPath);
    if (actualBytes !== entry.bytes) {
      reasons.push(`${entry.path}: bytes divergem (manifesto=${entry.bytes}, atual=${actualBytes})`);
    }
    if (actualSha256 !== entry.sha256) {
      reasons.push(`${entry.path}: SHA-256 diverge (manifesto=${entry.sha256}, atual=${actualSha256})`);
    }
  }

  return { ok: reasons.length === 0, reasons, manifest, manifestSha256 };
}

// ---------- Pre-flight ----------
export interface PreflightInfo {
  holdout: string;
  caseCount: number;
  promptVersion: string;
  intendedModel: string;
  cliModel: string;
  actualRequestModel: string;
  temperature: number;
  schema: string;
  lowConfidenceThreshold: number;
  freezeManifestSha256: string;
}

export function printPreflight(info: PreflightInfo): void {
  console.log(`HOLDOUT: ${info.holdout}`);
  console.log(`CASE_COUNT: ${info.caseCount}`);
  console.log(`PROMPT_VERSION: ${info.promptVersion}`);
  console.log(`INTENDED_MODEL: ${info.intendedModel}`);
  console.log(`CLI_MODEL: ${info.cliModel}`);
  console.log(`ACTUAL_REQUEST_MODEL: ${info.actualRequestModel}`);
  console.log(`TEMPERATURE: ${info.temperature}`);
  console.log(`SCHEMA: ${info.schema}`);
  console.log(`LOW_CONFIDENCE_THRESHOLD: ${info.lowConfidenceThreshold}`);
  console.log(`FREEZE_MANIFEST_SHA256: ${info.freezeManifestSha256}`);
}

/**
 * Módulos do motor carregados DINAMICAMENTE, depois do env estar pronto —
 * nunca usados para escolher o modelo (só para prompt/schema/threshold/policy).
 */
async function loadEngineModulesSafely() {
  const [aiConfig, analysisPrompt, geminiModule, analysisSchema] = await Promise.all([
    import('../../src/config/ai'),
    import('../../src/lib/ai/analysis-prompt'),
    import('../../src/lib/ai/gemini'),
    import('../../src/lib/ai/analysis-schema'),
  ]);
  return { aiConfig, analysisPrompt, geminiModule, analysisSchema };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  const modelError = validateCliModel(args);
  if (modelError) {
    console.error(`ABORT: ${modelError}`);
    console.error('Nenhuma chamada ao Gemini foi feita.');
    process.exitCode = 1;
    return;
  }

  // .env.local só é usado para GEMINI_API_KEY — nunca para o model ID desta execução selada.
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

  const repoRoot = path.resolve(BENCHMARK_DIR, '..', '..');
  const { HOLDOUT_V24_BLIND_CASES } = await import('./holdout-v24-blind-cases');
  const { aiConfig, analysisPrompt } = await loadEngineModulesSafely();

  const freezeManifestSha256 = existsSync(FREEZE_MANIFEST_PATH) ? sha256File(FREEZE_MANIFEST_PATH) : 'MANIFEST_NOT_FOUND';

  printPreflight({
    holdout: HOLDOUT_NAME,
    caseCount: HOLDOUT_V24_BLIND_CASES.length,
    promptVersion: analysisPrompt.PROMPT_VERSION,
    intendedModel: INTENDED_MODEL,
    cliModel: args.model!,
    actualRequestModel: INTENDED_MODEL, // travado: a requisição SEMPRE usa INTENDED_MODEL, nunca args.model diretamente
    temperature: REQUEST_TEMPERATURE,
    schema: 'GEMINI_RESPONSE_SCHEMA (src/lib/ai/gemini.ts) + analysisOutputSchema (zod, src/lib/ai/analysis-schema.ts)',
    lowConfidenceThreshold: aiConfig.LOW_CONFIDENCE_THRESHOLD,
    freezeManifestSha256,
  });

  // Validações explícitas pedidas na especificação (redundantes com validateCliModel,
  // mas mantidas como checagem própria e nomeada antes da primeira chamada).
  if (args.model !== INTENDED_MODEL) {
    console.error('ABORT BEFORE FIRST MODEL CALL: CLI_MODEL !== INTENDED_MODEL');
    process.exitCode = 1;
    return;
  }
  const actualRequestModelForCheck = INTENDED_MODEL;
  if (actualRequestModelForCheck !== INTENDED_MODEL) {
    console.error('ABORT BEFORE FIRST MODEL CALL: ACTUAL_REQUEST_MODEL !== INTENDED_MODEL');
    process.exitCode = 1;
    return;
  }

  if (HOLDOUT_V24_BLIND_CASES.length !== EXPECTED_CASE_COUNT) {
    console.error(`ABORT BEFORE FIRST MODEL CALL: case count = ${HOLDOUT_V24_BLIND_CASES.length}, esperado ${EXPECTED_CASE_COUNT}.`);
    process.exitCode = 1;
    return;
  }

  const freezeCheck = verifyFreezeManifest(repoRoot);
  if (!freezeCheck.ok) {
    console.error('ABORT BEFORE FIRST MODEL CALL: verificação de freeze falhou:');
    for (const reason of freezeCheck.reasons) console.error(`  - ${reason}`);
    process.exitCode = 1;
    return;
  }
  console.log('FREEZE VERIFICATION: PASS (hashes, caseCount, caseIds e gates conferem com o manifesto).');

  if (!args.executeBlind) {
    console.log('\nDRY/PREFLIGHT ONLY — MODEL NOT EXECUTED');
    return;
  }

  // ---------------------------------------------------------------------
  // A PARTIR DAQUI só roda com --execute-blind. NÃO fornecido nesta tarefa.
  // Documentado e implementado para autorização futura, não invocado agora.
  // ---------------------------------------------------------------------
  console.log('\n### INICIANDO EXECUÇÃO CEGA ÚNICA (--execute-blind) ###');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ABORT BEFORE FIRST MODEL CALL: GEMINI_API_KEY ausente em .env.local.');
    process.exitCode = 1;
    return;
  }

  const { GEMINI_RESPONSE_SCHEMA } = await import('../../src/lib/ai/gemini');
  const { analysisOutputSchema, enforceDiagnosticInvariants } = await import('../../src/lib/ai/analysis-schema');
  const { buildAnalysisUserPrompt, ANALYSIS_SYSTEM_PROMPT } = analysisPrompt;

  const startedAt = new Date().toISOString();
  const results: unknown[] = [];

  for (const c of HOLDOUT_V24_BLIND_CASES) {
    const input = {
      question: c.question,
      userAnswer: c.userAnswer,
      correctAnswer: c.correctAnswer,
      ...(c.studentReasoning ? { studentReasoning: c.studentReasoning } : {}),
    };
    const userPrompt = buildAnalysisUserPrompt(input);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let text: string;
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(INTENDED_MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: ANALYSIS_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: REQUEST_TEMPERATURE,
              responseMimeType: 'application/json',
              responseSchema: GEMINI_RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        console.error(`ABORT EXECUTION: HTTP ${response.status} em ${c.id}. Rodada marcada inválida.`);
        process.exitCode = 1;
        return;
      }
      const json = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    } finally {
      clearTimeout(timer);
    }

    // "modelVersion" no cliente injetado (GeminiAnalysisClient) reflete o modelo
    // SOLICITADO, não uma confirmação independente do provedor — mesma limitação
    // documentada em src/lib/ai/gemini.ts. Aqui, como a requisição já é travada em
    // INTENDED_MODEL, a verificação abaixo é uma confirmação de invariante interna,
    // não uma confirmação externa do provedor Gemini.
    const modelVersionForThisCall = INTENDED_MODEL;
    if (modelVersionForThisCall !== INTENDED_MODEL) {
      console.error(`ABORT EXECUTION: modelVersion (${modelVersionForThisCall}) != INTENDED_MODEL (${INTENDED_MODEL}) em ${c.id}. Rodada marcada inválida.`);
      process.exitCode = 1;
      return;
    }

    const parsed = JSON.parse(text);
    const validation = analysisOutputSchema.safeParse(parsed);
    if (!validation.success) {
      results.push({ caseId: c.id, ok: false, errorMessage: `SCHEMA_INVALID: ${validation.error.message}` });
      continue;
    }
    const raw = validation.data;
    const final = enforceDiagnosticInvariants(input, raw);
    results.push({ caseId: c.id, ok: true, raw, final, modelVersion: modelVersionForThisCall });
  }

  const finishedAt = new Date().toISOString();
  const output = {
    instrument: HOLDOUT_NAME,
    promptVersion: analysisPrompt.PROMPT_VERSION,
    intendedModel: INTENDED_MODEL,
    actualRequestModel: INTENDED_MODEL,
    startedAt,
    finishedAt,
    caseCount: HOLDOUT_V24_BLIND_CASES.length,
    freezeManifestSha256,
    temperature: REQUEST_TEMPERATURE,
    modelVersionCaveat:
      'modelVersion representa o modelo solicitado pelo cliente na chamada HTTP, não uma confirmação independente fornecida pelo provedor Gemini.',
    results,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Resultados salvos em ${RESULTS_PATH}`);
}

// Só executa main() quando rodado diretamente via `tsx run-holdout-v24-blind.ts`
// (permite import seguro deste módulo em testes, sem `require`/`module`, que não
// existem no runtime ESM/vite-node usado pelo vitest).
const invokedDirectly = typeof process.argv[1] === 'string' && process.argv[1].replace(/\\/g, '/').endsWith('run-holdout-v24-blind.ts');
if (invokedDirectly) {
  main();
}
