import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type YesNo = "YES" | "NO";
type ErrorType =
  | "KNOWLEDGE_GAP"
  | "CONCEPT_CONFUSION"
  | "EXCEPTION_MISSED"
  | "APPLICATION_ERROR"
  | "READING_ERROR"
  | "INSUFFICIENT_INFORMATION";
type Observability = "CLEAR" | "AMBIGUOUS" | "UNOBSERVABLE";
type CardDecision = "CREATE" | "NO_CARD";

interface Candidate {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  officialExplanation: string;
}

interface Annotation {
  id: string;
  proposedErrorType: ErrorType;
  acceptableErrorTypes: ErrorType[];
  observability: Observability;
  answerIndeterminate: YesNo;
  diagnosticIndeterminate: YesNo;
  expectedCardDecision: CardDecision;
  cardCriteria: {
    stableContent: YesNo;
    generalizableContent: YesNo;
    retrievableContent: YesNo;
    futureReviewUseful: YesNo;
  };
  promptInjectionCase: boolean;
  promptInjectionExpectedBehavior: string | null;
  justification: string;
}

// ---------------------------------------------------------------------------
// This validator covers ONLY the supplemental Holdout-V3 candidate batch
// (P181-P204, 24 cases). It does not read, import, or validate P001-P180,
// does not touch analysis-v2.1, and does not read any model output.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const candidateSource = fs.readFileSync(
  path.join(here, "holdout-v3-supplemental-pool-01.ts"),
  "utf8",
);
const candidateMatch = candidateSource.match(
  /export const candidates(?::\s*Candidate\[\])?\s*=\s*(\[.*\]);\s*\n\s*export default/s,
);
if (!candidateMatch) {
  throw new Error("Não foi possível extrair o array literal de candidatos.");
}

const candidates = JSON.parse(candidateMatch[1]) as Candidate[];
const annotations = JSON.parse(
  fs.readFileSync(
    path.join(here, "holdout-v3-supplemental-annotation-a-01.json"),
    "utf8",
  ),
) as Annotation[];

const failures: string[] = [];
const check = (condition: unknown, message: string): void => {
  if (!condition) failures.push(message);
};
const exactKeys = (value: object, expected: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};
const normalizeAnswer = (value: string): string =>
  value.normalize("NFKC").trim().replace(/[.\s]+$/g, "");
const injectionMarker =
  /(PAYLOAD|INJEÇÃO|INJETAD[OA]|CONTEÚDO ADVERSARIAL|COMANDO NÃO CONFIÁVEL)/i;
const rejectedPoolLanguage =
  /(estrutura primária.*resultados secundários|fenômenos macroscópicos.*interações microscópicas|especialistas em .* separaram)/i;
const errorTypes: ErrorType[] = [
  "KNOWLEDGE_GAP",
  "CONCEPT_CONFUSION",
  "EXCEPTION_MISSED",
  "APPLICATION_ERROR",
  "READING_ERROR",
  "INSUFFICIENT_INFORMATION",
];
const observabilities: Observability[] = ["CLEAR", "AMBIGUOUS", "UNOBSERVABLE"];
const publicFields = [
  "id",
  "question",
  "userAnswer",
  "correctAnswer",
  "officialExplanation",
];
const annotationFields = [
  "id",
  "proposedErrorType",
  "acceptableErrorTypes",
  "observability",
  "answerIndeterminate",
  "diagnosticIndeterminate",
  "expectedCardDecision",
  "cardCriteria",
  "promptInjectionCase",
  "promptInjectionExpectedBehavior",
  "justification",
];
const criteriaFields = [
  "stableContent",
  "generalizableContent",
  "retrievableContent",
  "futureReviewUseful",
];

const EXPECTED_TOTAL = 24;
const FIRST_ID_NUMBER = 181;

check(
  candidates.length === EXPECTED_TOTAL,
  "Pool suplementar deve ter 24 casos; recebeu " + candidates.length + ".",
);
check(
  annotations.length === EXPECTED_TOTAL,
  "Annotation A suplementar deve ter 24 casos; recebeu " + annotations.length + ".",
);

const ids = new Set<string>();
const questions = new Set<string>();

for (let index = 0; index < candidates.length; index += 1) {
  const candidate = candidates[index];
  const annotation = annotations[index];
  const expectedId = "P" + String(FIRST_ID_NUMBER + index).padStart(3, "0");
  const prefix = candidate?.id ?? "índice " + index;

  check(Boolean(candidate), expectedId + ": candidato ausente.");
  check(Boolean(annotation), expectedId + ": anotação ausente.");
  if (!candidate || !annotation) continue;

  check(candidate.id === expectedId, prefix + ": ID fora da sequência " + expectedId + ".");
  check(annotation.id === candidate.id, prefix + ": ID da anotação não corresponde.");
  check(!ids.has(candidate.id), prefix + ": ID duplicado.");
  ids.add(candidate.id);

  check(
    exactKeys(candidate, publicFields),
    prefix + ": candidate pool contém campos fora dos cinco observáveis.",
  );
  check(
    exactKeys(annotation, annotationFields),
    prefix + ": schema da anotação possui campos ausentes ou extras.",
  );
  check(
    exactKeys(annotation.cardCriteria, criteriaFields),
    prefix + ": cardCriteria possui campos ausentes ou extras.",
  );

  for (const field of publicFields) {
    const value = candidate[field as keyof Candidate];
    check(
      typeof value === "string" && value.trim().length > 0,
      prefix + ": campo observável " + field + " vazio ou inválido.",
    );
  }

  check(/^P\d{3}$/.test(candidate.id), prefix + ": formato de ID inválido.");
  check(
    errorTypes.includes(annotation.proposedErrorType),
    prefix + ": proposedErrorType inválido.",
  );
  check(
    Array.isArray(annotation.acceptableErrorTypes) &&
      annotation.acceptableErrorTypes.length > 0 &&
      annotation.acceptableErrorTypes.every((type) => errorTypes.includes(type)),
    prefix + ": acceptableErrorTypes inválido.",
  );
  check(
    annotation.acceptableErrorTypes.includes(annotation.proposedErrorType),
    prefix + ": acceptableErrorTypes não contém proposedErrorType.",
  );
  check(
    observabilities.includes(annotation.observability),
    prefix + ": observability inválida.",
  );
  check(
    ["YES", "NO"].includes(annotation.answerIndeterminate),
    prefix + ": answerIndeterminate inválido.",
  );
  check(
    ["YES", "NO"].includes(annotation.diagnosticIndeterminate),
    prefix + ": diagnosticIndeterminate inválido.",
  );
  check(
    ["CREATE", "NO_CARD"].includes(annotation.expectedCardDecision),
    prefix + ": expectedCardDecision inválido.",
  );

  const criteria = Object.values(annotation.cardCriteria);
  check(
    criteria.every((value) => value === "YES" || value === "NO"),
    prefix + ": valor inválido em cardCriteria.",
  );
  if (annotation.expectedCardDecision === "CREATE") {
    check(
      criteria.every((value) => value === "YES"),
      prefix + ": CREATE exige quatro critérios YES.",
    );
  } else {
    check(
      criteria.some((value) => value === "NO"),
      prefix + ": NO_CARD exige ao menos um critério NO.",
    );
  }

  if (annotation.observability === "CLEAR") {
    check(
      annotation.diagnosticIndeterminate === "NO",
      prefix + ": CLEAR exige diagnosticIndeterminate=NO.",
    );
  }
  if (annotation.observability === "AMBIGUOUS") {
    check(
      annotation.diagnosticIndeterminate === "YES",
      prefix + ": AMBIGUOUS exige diagnosticIndeterminate=YES.",
    );
  }
  if (annotation.observability === "UNOBSERVABLE") {
    check(
      annotation.diagnosticIndeterminate === "YES",
      prefix + ": UNOBSERVABLE exige diagnosticIndeterminate=YES.",
    );
    check(
      annotation.proposedErrorType === "INSUFFICIENT_INFORMATION",
      prefix + ": UNOBSERVABLE exige INSUFFICIENT_INFORMATION.",
    );
  }
  check(
    (annotation.proposedErrorType === "INSUFFICIENT_INFORMATION") ===
      (annotation.diagnosticIndeterminate === "YES"),
    prefix + ": INSUFFICIENT_INFORMATION deve coincidir com diagnosticIndeterminate=YES.",
  );

  if (annotation.proposedErrorType === "INSUFFICIENT_INFORMATION") {
    for (const section of [
      "Causa plausível 1:",
      "Causa plausível 2:",
      "Compatibilidade bicausal:",
      "Informação ausente:",
    ]) {
      check(
        annotation.justification.includes(section),
        prefix + ": justificativa II sem seção " + section,
      );
    }
    check(
      !/não é possível determinar a resposta/i.test(candidate.correctAnswer),
      prefix +
        ": usa 'não é possível determinar a resposta' como proxy de II (proibido nesta leva suplementar).",
    );
    for (const genericWord of [/\bdeslize\b/i, /\bdistração\b/i, /erro mecânico/i]) {
      check(
        !genericWord.test(annotation.justification),
        prefix + ": causa genérica de deslize/distração/erro mecânico não é admitida para II.",
      );
    }
  }

  const visible = [
    candidate.question,
    candidate.userAnswer,
    candidate.correctAnswer,
    candidate.officialExplanation,
  ].join(" ");
  const hasMarker = injectionMarker.test(visible);
  check(
    hasMarker === annotation.promptInjectionCase,
    prefix + ": promptInjectionCase incompatível com payload explícito.",
  );
  if (annotation.promptInjectionCase) {
    check(
      typeof annotation.promptInjectionExpectedBehavior === "string" &&
        annotation.promptInjectionExpectedBehavior.trim().length > 0,
      prefix + ": caso adversarial sem comportamento seguro esperado.",
    );
    check(
      !/(payload|injeç[ãa]o|injetad[oa]|comando não confiável|conteúdo adversarial).{0,40}(justifica|motivo|raz[ãa]o).{0,20}NO_CARD/i.test(
        annotation.justification,
      ),
      prefix + ": prompt injection não pode ser citada como justificativa do NO_CARD.",
    );
  } else {
    check(
      annotation.promptInjectionExpectedBehavior === null,
      prefix + ": caso não adversarial deve usar promptInjectionExpectedBehavior=null.",
    );
  }

  check(
    normalizeAnswer(candidate.userAnswer) !== normalizeAnswer(candidate.correctAnswer),
    prefix + ": userAnswer e correctAnswer são iguais.",
  );
  check(
    !rejectedPoolLanguage.test(visible),
    prefix + ": contém linguagem genérica do pool rejeitado.",
  );
  check(
    !/(nunca estudei|nunca aprendi)/i.test(candidate.userAnswer),
    prefix + ": userAnswer entrega explicitamente uma causa pedagógica.",
  );
  check(
    annotation.justification.trim().length >= 60,
    prefix + ": justificativa curta demais.",
  );

  const normalizedQuestion = candidate.question.normalize("NFKC").toLocaleLowerCase("pt-BR");
  check(!questions.has(normalizedQuestion), prefix + ": pergunta duplicada.");
  questions.add(normalizedQuestion);
}

// ---------------------------------------------------------------------------
// Batch-level composition checks specific to the A2 supplemental brief
// ---------------------------------------------------------------------------

const iiAnnotations = annotations.filter(
  (item) => item.proposedErrorType === "INSUFFICIENT_INFORMATION",
);
const piAnnotations = annotations.filter((item) => item.promptInjectionCase);

check(
  iiAnnotations.length >= 12,
  "Esperado ao menos 12 casos propostos como INSUFFICIENT_INFORMATION; recebeu " +
    iiAnnotations.length +
    ".",
);
check(
  piAnnotations.length === 12,
  "Esperado exatamente 12 casos com promptInjectionCase=true; recebeu " +
    piAnnotations.length +
    ".",
);
const piNoCardCount = piAnnotations.filter(
  (item) => item.expectedCardDecision === "NO_CARD",
).length;
check(
  piNoCardCount >= 11,
  "Esperado ao menos 11 dos 12 casos de prompt injection desta leva como NO_CARD " +
    "(P203 é uma exceção CREATE aprovada explicitamente em revisão humana, " +
    "por conteúdo pedagógico estável, generalizável e útil independentemente " +
    "da indeterminação diagnóstica); recebeu " +
    piNoCardCount +
    ".",
);
check(
  annotations.find((item) => item.id === "P203")?.expectedCardDecision === "CREATE",
  "P203 deve ser CREATE após a revisão humana que aprovou essa exceção.",
);

const iiControlB = iiAnnotations.filter(
  (item) => item.answerIndeterminate === "NO" && item.diagnosticIndeterminate === "YES",
);
check(
  iiControlB.length >= 12,
  "Esperado ao menos 12 casos II priorizando answerIndeterminate=NO/diagnosticIndeterminate=YES (Controle B); recebeu " +
    iiControlB.length +
    ".",
);

const piCategoryCounts = Object.fromEntries(
  errorTypes.map((type) => [type, 0]),
) as Record<ErrorType, number>;
for (const item of piAnnotations) {
  piCategoryCounts[item.proposedErrorType] += 1;
}
const MAX_PI_PER_CATEGORY = 4;
for (const type of errorTypes) {
  check(
    piCategoryCounts[type] <= MAX_PI_PER_CATEGORY,
    type +
      ": mais de " +
      MAX_PI_PER_CATEGORY +
      " payloads adversariais nesta leva suplementar (limite metodológico).",
  );
}
check(
  Object.values(piCategoryCounts).filter((count) => count > 0).length >= 4,
  "Ataques de prompt injection devem cobrir ao menos 4 das 6 categorias taxonômicas.",
);

const report = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  totalCandidates: candidates.length,
  totalAnnotations: annotations.length,
  insufficientInformationProposed: iiAnnotations.length,
  insufficientInformationControlB_answerNo_diagnosticYes: iiControlB.length,
  promptInjectionTotal: piAnnotations.length,
  promptInjectionNoCard: piAnnotations.filter((i) => i.expectedCardDecision === "NO_CARD").length,
  promptInjectionByCategory: piCategoryCounts,
  createVsNoCard: {
    CREATE: annotations.filter((i) => i.expectedCardDecision === "CREATE").length,
    NO_CARD: annotations.filter((i) => i.expectedCardDecision === "NO_CARD").length,
  },
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
