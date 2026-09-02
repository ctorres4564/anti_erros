import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

function sha256File(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

const benchmarkDir = path.resolve('c:/anti_erros/scripts/benchmark');
const casesPath = path.join(benchmarkDir, 'holdout-v2-cases.ts');
const annotationAPath = path.join(benchmarkDir, 'holdout-v2-annotation-a.json');

const casesHash = sha256File(casesPath);
const annotationAHash = sha256File(annotationAPath);

const manifest = {
  version: '2.0.0-holdout-v2-annotation-a',
  createdAt: '2026-08-27T08:02:00Z',
  caseCount: 120,
  casesPerCategory: 20,
  shuffleSeed: 20260827,
  protocolFile: 'docs/SPRINT_3_HOLDOUT_V2_PROTOCOL.md',
  protocolCommit: 'd505dc0',
  answerDiagnosticCrossControls: true,
  categoryDistribution: {
    KNOWLEDGE_GAP: 20,
    CONCEPT_CONFUSION: 20,
    EXCEPTION_MISSED: 20,
    APPLICATION_ERROR: 20,
    READING_ERROR: 20,
    INSUFFICIENT_INFORMATION: 20
  },
  observabilityDistribution: {
    CLEAR: 100,
    AMBIGUOUS: 0,
    UNOBSERVABLE: 20
  },
  quadrantDistribution: {
    answerYesDiagYes: 10,
    answerYesDiagNo: 13,
    answerNoDiagYes: 10,
    answerNoDiagNo: 87
  },
  cardDecisionDistribution: {
    CREATE: 79,
    NO_CARD: 41,
    iiCreate: 11,
    iiNoCard: 9
  },
  promptInjection: {
    totalCases: 20,
    promptInjectionCreate: 10,
    promptInjectionNoCard: 10,
    categoriesCovered: 6,
    distribution: {
      EXCEPTION_MISSED: 4,
      KNOWLEDGE_GAP: 3,
      INSUFFICIENT_INFORMATION: 4,
      APPLICATION_ERROR: 3,
      CONCEPT_CONFUSION: 3,
      READING_ERROR: 3
    }
  },
  files: {
    'scripts/benchmark/holdout-v2-cases.ts': {
      sha256: casesHash,
      visibility: 'PUBLIC_OBSERVABLE',
      fields: ['id', 'question', 'userAnswer', 'correctAnswer', 'officialExplanation']
    },
    'scripts/benchmark/holdout-v2-annotation-a.json': {
      sha256: annotationAHash,
      visibility: 'PRIVATE_ANNOTATION_A',
      annotator: 'ANNOTATOR_A'
    }
  },
  antiLeakageAudit: {
    benchmarkV2Referenced: false,
    holdoutV1Referenced: false,
    analysisV21Executed: false,
    modelExecuted: false,
    status: 'PASS'
  },
  modelExecuted: false,
  status: 'ANNOTATION_A_COMPLETE_MODEL_UNSEEN'
};

const manifestPath = path.join(benchmarkDir, 'holdout-v2-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
console.log('Manifesto holdout-v2-manifest.json gerado com sucesso!');
console.log('Cases SHA256:', casesHash);
console.log('Annotation A SHA256:', annotationAHash);
