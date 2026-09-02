/**
 * Runner one-shot selado do holdout-v25-blind contra analysis-v2.5.
 * Não possui retry: cada caso gera no máximo uma chamada ao modelo.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HOLDOUT = 'holdout-v25-blind';
const INTENDED_MODEL = 'gemini-3.7-flash';
const PROMPT_VERSION = 'analysis-v2.5';
const TEMPERATURE = 0.2;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const EXPECTED_MANIFEST_SHA256 = 'c75a0bf2481dfaff880acb77c6b34d1b68d0b8a81075eba9f4462ecad86df771';
const EXPECTED_CASE_IDS = Array.from({ length: 24 }, (_, index) => `HF${String(index + 1).padStart(2, '0')}`);
const BENCHMARK_DIR = path.resolve(__dirname);
const MANIFEST_PATH = path.resolve(BENCHMARK_DIR, 'holdout-v25-blind-freeze.json');
const RESULTS_PATH = path.resolve(BENCHMARK_DIR, 'holdout-v25-blind-results.json');

interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

interface FreezeManifest {
  instrument: string;
  status: string;
  promptVersion: string;
  intendedModel: string;
  temperature: number;
  lowConfidenceThreshold: number;
  caseCount: number;
  caseIds: string[];
  adversarialCaseIds: string[];
  insufficientInformationCaseIds: string[];
  counterfactualPairs: Array<{ cases: [string, string] }>;
  gates: Record<string, { threshold?: number; minimumPassingCases?: number; totalCases?: number; maximumAllowed?: number }>;
  files: ManifestFile[];
}

interface GroundTruthEntry {
  id: string;
  expectedErrorType: string;
  acceptableErrorTypes: string[];
  expectedSufficiency: 'SUFFICIENT' | 'INSUFFICIENT';
  expectedCardDecision: 'CREATE' | 'NO_CARD';
  promptInjectionCase: boolean;
}

interface AttemptResult {
  attemptNumber: number;
  caseId: string;
  operationalStatus: 'COMPLETED' | 'HTTP_ERROR' | 'TIMEOUT' | 'NETWORK_ERROR' | 'EMPTY_RESPONSE' | 'SCHEMA_INVALID';
  latencyMs: number;
  httpStatus?: number;
  operationalError?: string;
  providerResponse?: unknown;
  rawResponseText?: string;
  raw?: unknown;
  final?: unknown;
  policyIntervention?: boolean;
  schemaIssues?: unknown;
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function persist(output: Record<string, unknown>) {
  writeFileSync(RESULTS_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}

function failPreflight(message: string): never {
  throw new Error(`ABORT BEFORE FIRST MODEL CALL: ${message}`);
}

async function main() {
  const args = new Map(
    process.argv.slice(2).map((argument) => {
      const [key, ...rest] = argument.split('=');
      return [key, rest.join('=')];
    })
  );
  if (!args.has('--execute-blind')) failPreflight('--execute-blind ausente');
  if (args.get('--model') !== INTENDED_MODEL) failPreflight(`model deve ser ${INTENDED_MODEL}`);
  if (args.get('--manifest-sha256') !== EXPECTED_MANIFEST_SHA256) failPreflight('SHA-256 do manifesto informado diverge');
  if (existsSync(RESULTS_PATH)) failPreflight('arquivo de resultados já existe; rerun proibido');

  const actualManifestSha256 = sha256File(MANIFEST_PATH);
  if (actualManifestSha256 !== EXPECTED_MANIFEST_SHA256) failPreflight('integridade do manifesto falhou');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as FreezeManifest;
  if (manifest.instrument !== HOLDOUT || manifest.status !== 'FROZEN') failPreflight('instrumento/status do manifesto inválido');
  if (manifest.intendedModel !== INTENDED_MODEL) failPreflight('intendedModel do manifesto diverge');
  if (manifest.temperature !== TEMPERATURE) failPreflight('temperature do manifesto diverge');
  if (manifest.lowConfidenceThreshold !== LOW_CONFIDENCE_THRESHOLD) failPreflight('lowConfidenceThreshold do manifesto diverge');
  if (manifest.promptVersion !== PROMPT_VERSION) failPreflight('promptVersion do manifesto diverge');

  const repoRoot = path.resolve(BENCHMARK_DIR, '..', '..');
  for (const file of manifest.files) {
    const absolutePath = path.resolve(repoRoot, file.path);
    if (!existsSync(absolutePath)) failPreflight(`arquivo congelado ausente: ${file.path}`);
    if (readFileSync(absolutePath).length !== file.bytes) failPreflight(`tamanho divergente: ${file.path}`);
    if (sha256File(absolutePath) !== file.sha256) failPreflight(`hash divergente: ${file.path}`);
  }

  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: path.resolve(repoRoot, '.env.local') });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) failPreflight('GEMINI_API_KEY ausente');

  const [{ HOLDOUT_V25_BLIND_CASES }, aiConfig, promptModule, geminiModule, schemaModule] = await Promise.all([
    import('./holdout-v25-blind-cases'),
    import('../../src/config/ai'),
    import('../../src/lib/ai/analysis-prompt'),
    import('../../src/lib/ai/gemini'),
    import('../../src/lib/ai/analysis-schema'),
  ]);
  if (HOLDOUT_V25_BLIND_CASES.length !== 24) failPreflight('caseCount diferente de 24');
  if (JSON.stringify(HOLDOUT_V25_BLIND_CASES.map((entry) => entry.id)) !== JSON.stringify(EXPECTED_CASE_IDS)) {
    failPreflight('IDs/ordem dos casos divergem de HF01–HF24');
  }
  if (aiConfig.LOW_CONFIDENCE_THRESHOLD !== LOW_CONFIDENCE_THRESHOLD) failPreflight('threshold ativo diverge de 0.6');
  if (promptModule.PROMPT_VERSION !== PROMPT_VERSION) failPreflight('analysis ativo não é v2.5');

  console.log(`PREFLIGHT PASS | ${HOLDOUT} | ${INTENDED_MODEL} | temperature=${TEMPERATURE} | threshold=${LOW_CONFIDENCE_THRESHOLD}`);
  console.log(`MANIFEST SHA-256: ${actualManifestSha256}`);
  console.log('GROUND TRUTH NOT LOADED — iniciando 24 tentativas únicas.');

  const startedAt = new Date().toISOString();
  const attempts: AttemptResult[] = [];
  const output: Record<string, unknown> = {
    instrument: HOLDOUT,
    status: 'RUNNING',
    promptVersion: PROMPT_VERSION,
    intendedModel: INTENDED_MODEL,
    actualRequestModel: INTENDED_MODEL,
    temperature: TEMPERATURE,
    lowConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
    freezeManifestSha256: actualManifestSha256,
    startedAt,
    rerunPermitted: false,
    attempts,
  };
  persist(output);

  for (let index = 0; index < HOLDOUT_V25_BLIND_CASES.length; index++) {
    const testCase = HOLDOUT_V25_BLIND_CASES[index];
    const input = {
      question: testCase.question,
      userAnswer: testCase.userAnswer,
      correctAnswer: testCase.correctAnswer,
      ...(testCase.studentReasoning ? { studentReasoning: testCase.studentReasoning } : {}),
    };
    const userPrompt = promptModule.buildAnalysisUserPrompt(input);
    const attemptStarted = Date.now();
    const attempt: AttemptResult = {
      attemptNumber: index + 1,
      caseId: testCase.id,
      operationalStatus: 'NETWORK_ERROR',
      latencyMs: 0,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(INTENDED_MODEL)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: promptModule.ANALYSIS_SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: TEMPERATURE,
              responseMimeType: 'application/json',
              responseSchema: geminiModule.GEMINI_RESPONSE_SCHEMA,
            },
          }),
          signal: controller.signal,
        }
      );
      attempt.httpStatus = response.status;
      const responseBody = await response.text();
      if (!response.ok) {
        attempt.operationalStatus = 'HTTP_ERROR';
        attempt.operationalError = `HTTP ${response.status}: ${responseBody.slice(0, 1000)}`;
      } else {
        let providerResponse: unknown;
        try {
          providerResponse = JSON.parse(responseBody);
          attempt.providerResponse = providerResponse;
        } catch {
          attempt.operationalStatus = 'EMPTY_RESPONSE';
          attempt.operationalError = 'Resposta HTTP não contém JSON válido do provedor.';
        }

        if (providerResponse) {
          const payload = providerResponse as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
          const rawText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
          attempt.rawResponseText = rawText;
          if (!rawText.trim()) {
            attempt.operationalStatus = 'EMPTY_RESPONSE';
            attempt.operationalError = 'Resposta do modelo sem texto.';
          } else {
            try {
              const parsed = JSON.parse(rawText);
              const validation = schemaModule.analysisOutputSchema.safeParse(parsed);
              if (!validation.success) {
                attempt.operationalStatus = 'SCHEMA_INVALID';
                attempt.schemaIssues = validation.error.flatten();
                attempt.raw = parsed;
              } else {
                const raw = validation.data;
                const final = schemaModule.enforceDiagnosticInvariants(input, raw);
                attempt.operationalStatus = 'COMPLETED';
                attempt.raw = raw;
                attempt.final = final;
                attempt.policyIntervention = JSON.stringify(raw) !== JSON.stringify(final);
              }
            } catch (error) {
              attempt.operationalStatus = 'SCHEMA_INVALID';
              attempt.operationalError = `JSON de saída inválido: ${error instanceof Error ? error.message : String(error)}`;
            }
          }
        }
      }
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      attempt.operationalStatus = isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR';
      attempt.operationalError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
      attempt.latencyMs = Date.now() - attemptStarted;
      attempts.push(attempt);
      persist(output);
      console.log(`${testCase.id}: ${attempt.operationalStatus} (${attempt.latencyMs}ms)`);
    }
  }

  // O ground truth só é carregado depois de todas as 24 tentativas terminarem.
  const groundTruth = JSON.parse(
    readFileSync(path.resolve(BENCHMARK_DIR, 'holdout-v25-blind-ground-truth.json'), 'utf8')
  ) as GroundTruthEntry[];
  const truthById = new Map(groundTruth.map((entry) => [entry.id, entry]));

  let errorTypeCorrect = 0;
  let sufficiencyCorrect = 0;
  let cardCorrect = 0;
  let schemaFailures = 0;
  let fabricatedEvidenceGrounded = 0;
  let invariantViolations = 0;
  const scoredCases: Array<Record<string, unknown>> = [];

  for (const attempt of attempts) {
    const truth = truthById.get(attempt.caseId)!;
    if (attempt.operationalStatus === 'SCHEMA_INVALID') schemaFailures++;
    if (attempt.operationalStatus !== 'COMPLETED' || !attempt.final) {
      scoredCases.push({ caseId: attempt.caseId, completed: false, errorTypePass: false, sufficiencyPass: false, cardDecisionPass: false });
      continue;
    }
    const final = attempt.final as {
      probableErrorType: string;
      confidence: number;
      diagnosticEvidence?: { sufficient: boolean; evidenceSource: string | null; evidenceQuote: string | null; supportType: string; competingCauses: string[] };
      cardAction: string;
      card: unknown;
    };
    const predictedSufficiency = final.diagnosticEvidence?.sufficient === false || final.probableErrorType === 'INSUFFICIENT_INFORMATION'
      ? 'INSUFFICIENT'
      : 'SUFFICIENT';
    const predictedCard = final.cardAction === 'NO_CARD' ? 'NO_CARD' : 'CREATE';
    const errorTypePass = truth.acceptableErrorTypes.includes(final.probableErrorType);
    const sufficiencyPass = predictedSufficiency === truth.expectedSufficiency;
    const cardDecisionPass = predictedCard === truth.expectedCardDecision;
    if (errorTypePass) errorTypeCorrect++;
    if (sufficiencyPass) sufficiencyCorrect++;
    if (cardDecisionPass) cardCorrect++;

    const evidence = final.diagnosticEvidence;
    if (
      final.probableErrorType !== 'INSUFFICIENT_INFORMATION' &&
      evidence &&
      !schemaModule.isDiagnosticEvidenceGrounded(
        HOLDOUT_V25_BLIND_CASES.find((entry) => entry.id === attempt.caseId)!,
        evidence as Parameters<typeof schemaModule.isDiagnosticEvidenceGrounded>[1]
      )
    ) {
      fabricatedEvidenceGrounded++;
    }
    const violatesInvariant =
      (evidence?.sufficient === false && final.probableErrorType !== 'INSUFFICIENT_INFORMATION') ||
      (final.confidence < LOW_CONFIDENCE_THRESHOLD && final.probableErrorType !== 'INSUFFICIENT_INFORMATION') ||
      (final.probableErrorType === 'INSUFFICIENT_INFORMATION' && (final.cardAction !== 'NO_CARD' || final.card !== null)) ||
      (final.probableErrorType === 'READING_ERROR' && (final.cardAction !== 'NO_CARD' || final.card !== null)) ||
      (final.probableErrorType !== 'INSUFFICIENT_INFORMATION' && evidence?.evidenceSource === 'QUESTION');
    if (violatesInvariant) invariantViolations++;

    scoredCases.push({
      caseId: attempt.caseId,
      completed: true,
      expectedErrorTypes: truth.acceptableErrorTypes,
      predictedErrorType: final.probableErrorType,
      errorTypePass,
      expectedSufficiency: truth.expectedSufficiency,
      predictedSufficiency,
      sufficiencyPass,
      expectedCardDecision: truth.expectedCardDecision,
      predictedCardDecision: predictedCard,
      cardDecisionPass,
    });
  }

  const iiIds = manifest.insufficientInformationCaseIds;
  const iiPassed = iiIds.filter((id) => {
    const score = scoredCases.find((entry) => entry.caseId === id);
    return score?.completed === true && score.predictedErrorType === 'INSUFFICIENT_INFORMATION';
  }).length;
  const adversarialPassed = manifest.adversarialCaseIds.filter((id) => {
    const score = scoredCases.find((entry) => entry.caseId === id);
    return score?.completed === true && score.errorTypePass === true && score.sufficiencyPass === true && score.cardDecisionPass === true;
  }).length;
  const counterfactualPairResults = manifest.counterfactualPairs.map((pair) => {
    const members = pair.cases.map((id) => scoredCases.find((entry) => entry.caseId === id));
    return {
      cases: pair.cases,
      pass: members.every(
        (entry) => entry?.completed === true && entry.errorTypePass === true && entry.sufficiencyPass === true && entry.cardDecisionPass === true
      ),
    };
  });
  const operationalFailures = attempts.filter((attempt) =>
    ['HTTP_ERROR', 'TIMEOUT', 'NETWORK_ERROR', 'EMPTY_RESPONSE'].includes(attempt.operationalStatus)
  );
  const completed = attempts.filter((attempt) => attempt.operationalStatus === 'COMPLETED').length;

  const gates = {
    errorType: errorTypeCorrect >= 22,
    sufficiency: sufficiencyCorrect >= 22,
    cardDecision: cardCorrect >= 22,
    insufficientInformation: iiPassed === iiIds.length,
    adversarial: adversarialPassed === manifest.adversarialCaseIds.length,
    schema: schemaFailures === 0,
    fabricatedEvidence: fabricatedEvidenceGrounded === 0,
    invariants: invariantViolations === 0,
  };
  const holdoutPass = Object.values(gates).every(Boolean);

  Object.assign(output, {
    status: 'COMPLETED',
    finishedAt: new Date().toISOString(),
    groundTruthLoadedAfterAllAttempts: true,
    summary: {
      casesAttempted: attempts.length,
      casesCompleted: completed,
      operationalFailures: operationalFailures.map((failure) => ({
        caseId: failure.caseId,
        kind: failure.operationalStatus,
        message: failure.operationalError,
      })),
      errorType: { correct: errorTypeCorrect, total: 24, accuracy: errorTypeCorrect / 24 },
      sufficiency: { correct: sufficiencyCorrect, total: 24, accuracy: sufficiencyCorrect / 24 },
      cardDecision: { correct: cardCorrect, total: 24, accuracy: cardCorrect / 24 },
      insufficientInformation: { correct: iiPassed, total: iiIds.length },
      adversarial: { correct: adversarialPassed, total: manifest.adversarialCaseIds.length },
      counterfactualPairs: counterfactualPairResults,
      schemaFailures,
      fabricatedEvidenceGrounded,
      invariantViolations,
      gates,
      holdoutResult: holdoutPass ? 'PASS' : 'FAIL',
      rerunPermitted: false,
    },
    scoredCases,
  });
  persist(output);
  console.log(`HOLDOUT-V25 RESULT: ${holdoutPass ? 'PASS' : 'FAIL'}`);
}

const invokedDirectly = typeof process.argv[1] === 'string' && process.argv[1].replace(/\\/g, '/').endsWith('run-holdout-v25-blind.ts');
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
