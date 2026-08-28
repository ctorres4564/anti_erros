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

const here = path.dirname(fileURLToPath(import.meta.url));
const candidateSource = fs.readFileSync(
  path.join(here, "holdout-v3-candidate-pool.ts"),
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
  fs.readFileSync(path.join(here, "holdout-v3-annotation-a.json"), "utf8"),
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
const observabilities: Observability[] = [
  "CLEAR",
  "AMBIGUOUS",
  "UNOBSERVABLE",
];
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

check(
  candidates.length === 180,
  "Candidate pool deve ter 180 casos; recebeu " + candidates.length + ".",
);
check(
  annotations.length === 180,
  "Annotation A deve ter 180 casos; recebeu " + annotations.length + ".",
);

const ids = new Set<string>();
const questions = new Set<string>();
const counts = Object.fromEntries(
  errorTypes.map((type) => [
    type,
    { total: 0, create: 0, noCard: 0, promptInjection: 0 },
  ]),
) as Record<
  ErrorType,
  { total: number; create: number; noCard: number; promptInjection: number }
>;
const observabilityCounts: Record<Observability, number> = {
  CLEAR: 0,
  AMBIGUOUS: 0,
  UNOBSERVABLE: 0,
};

for (let index = 0; index < candidates.length; index += 1) {
  const candidate = candidates[index];
  const annotation = annotations[index];
  const expectedId = "P" + String(index + 1).padStart(3, "0");
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
    prefix +
      ": INSUFFICIENT_INFORMATION deve coincidir com diagnosticIndeterminate=YES.",
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
  } else {
    check(
      annotation.promptInjectionExpectedBehavior === null,
      prefix +
        ": caso não adversarial deve usar promptInjectionExpectedBehavior=null.",
    );
  }

  check(
    normalizeAnswer(candidate.userAnswer) !==
      normalizeAnswer(candidate.correctAnswer),
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

  const normalizedQuestion = candidate.question
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR");
  check(!questions.has(normalizedQuestion), prefix + ": pergunta duplicada.");
  questions.add(normalizedQuestion);

  if (errorTypes.includes(annotation.proposedErrorType)) {
    const category = counts[annotation.proposedErrorType];
    category.total += 1;
    category[
      annotation.expectedCardDecision === "CREATE" ? "create" : "noCard"
    ] += 1;
    if (annotation.promptInjectionCase) category.promptInjection += 1;
  }
  if (observabilities.includes(annotation.observability)) {
    observabilityCounts[annotation.observability] += 1;
  }
}

for (const type of errorTypes) {
  check(
    counts[type].total === 30,
    type + ": esperado 30 casos; recebeu " + counts[type].total + ".",
  );
  check(
    counts[type].promptInjection <= 5,
    type + ": mais de cinco payloads adversariais no candidate pool.",
  );
}

const p002 = annotations[1];
check(p002?.id === "P002", "P002 ausente.");
check(
  p002?.proposedErrorType === "KNOWLEDGE_GAP",
  "P002 deve ser KNOWLEDGE_GAP.",
);
check(
  p002?.acceptableErrorTypes.length === 1 &&
    p002.acceptableErrorTypes[0] === "KNOWLEDGE_GAP",
  "P002 não deve manter ambiguidade com CONCEPT_CONFUSION.",
);
check(p002?.observability === "CLEAR", "P002 deve ter observabilidade CLEAR.");

const promptInjection = annotations.filter(
  (item) => item.promptInjectionCase,
);
const report = {
  status: failures.length === 0 ? "PASS" : "FAIL",
  candidates: candidates.length,
  annotations: annotations.length,
  categories: counts,
  observability: observabilityCounts,
  answerIndeterminate: {
    yes: annotations.filter((item) => item.answerIndeterminate === "YES").length,
    no: annotations.filter((item) => item.answerIndeterminate === "NO").length,
  },
  diagnosticIndeterminate: {
    yes: annotations.filter(
      (item) => item.diagnosticIndeterminate === "YES",
    ).length,
    no: annotations.filter(
      (item) => item.diagnosticIndeterminate === "NO",
    ).length,
  },
  promptInjection: {
    total: promptInjection.length,
    create: promptInjection.filter(
      (item) => item.expectedCardDecision === "CREATE",
    ).length,
    noCard: promptInjection.filter(
      (item) => item.expectedCardDecision === "NO_CARD",
    ).length,
  },
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exit(1);
