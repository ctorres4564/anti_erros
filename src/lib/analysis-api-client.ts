import { z } from 'zod';
import type { AnalysisFormValues, AnalysisPreview, AnalysisView } from '@/types/analysis';

const analysisViewSchema: z.ZodType<AnalysisView> = z.object({
  id: z.string().uuid(),
  question: z.string(),
  userAnswer: z.string(),
  correctAnswer: z.string(),
  officialExplanation: z.string().nullable(),
  discipline: z.string().nullable().optional(),
  probableErrorType: z.string(),
  confidence: z.number().min(0).max(1),
  reasoningSummary: z.string(),
  recommendedAction: z.string().nullable().optional(),
  coreConcept: z.string(),
  cardAction: z.string(),
  card: z.object({ front: z.string(), back: z.string() }).nullable(),
  createdAt: z.string(),
});

const previewResponseSchema = z.object({
  success: z.literal(true),
  preview: z.object({
    probableErrorType: z.string(),
    concept: z.string(),
    discipline: z.string(),
    isAligned: z.boolean(),
  }),
  claimToken: z.string().optional(),
});

const analysisResponseSchema = z.object({
  analysis: analysisViewSchema,
});

const claimResponseSchema = z.object({
  success: z.literal(true),
  analysis: analysisViewSchema,
});

export type AnalysisApiErrorKind =
  | 'VALIDATION'
  | 'AUTH'
  | 'ONBOARDING'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'LIMIT'
  | 'IN_PROGRESS'
  | 'TEMPORARY'
  | 'NETWORK'
  | 'UNKNOWN';

export class AnalysisApiError extends Error {
  constructor(
    message: string,
    readonly kind: AnalysisApiErrorKind,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AnalysisApiError';
  }
}
function kindFromStatus(status: number, message: string): AnalysisApiErrorKind {
  if (status === 400) return message.toLowerCase().includes('token') ? 'TOKEN_INVALID' : 'VALIDATION';
  if (status === 401) return 'AUTH';
  if (status === 403) return message.toLowerCase().includes('onboarding') ? 'ONBOARDING' : 'VALIDATION';
  if (status === 404) return 'TOKEN_INVALID';
  if (status === 409) return message.toLowerCase().includes('andamento') ? 'IN_PROGRESS' : 'TOKEN_INVALID';
  if (status === 410) return 'TOKEN_EXPIRED';
  if (status === 429) return 'LIMIT';
  if (status >= 500) return 'TEMPORARY';
  return 'UNKNOWN';
}

async function parseError(response: Response): Promise<AnalysisApiError> {
  const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  const message = payload.message || payload.error || 'Não foi possível concluir a solicitação.';
  return new AnalysisApiError(message, kindFromStatus(response.status, message), response.status);
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  schema: z.ZodType<T>
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new AnalysisApiError(
      'Não foi possível conectar. Verifique sua internet e tente novamente.',
      'NETWORK'
    );
  }

  if (!response.ok) throw await parseError(response);

  const payload = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new AnalysisApiError('A resposta recebida não pôde ser validada.', 'TEMPORARY', response.status);
  }

  return parsed.data;
}

export async function submitAnonymousPreview(
  values: AnalysisFormValues,
  turnstileToken?: string
): Promise<AnalysisPreview> {
  const result = await requestJson(
    '/api/analyses/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, turnstileToken }),
    },
    previewResponseSchema
  );

  return result.preview;
}

export async function submitAuthenticatedAnalysis(values: AnalysisFormValues): Promise<AnalysisView> {
  const result = await requestJson(
    '/api/analyses',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(values),
    },
    analysisResponseSchema
  );

  return result.analysis;
}

export async function claimPendingAnalysis(): Promise<AnalysisView> {
  const result = await requestJson(
    '/api/pending-analyses/claim',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    claimResponseSchema
  );

  return result.analysis;
}
