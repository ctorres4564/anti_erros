import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalysisApiError,
  claimPendingAnalysis,
  confirmAnalysisDiscipline,
  submitAnalysisFeedback,
  submitAnonymousPreview,
  submitAuthenticatedAnalysis,
} from '@/lib/analysis-api-client';
import type { AnalysisFormValues, AnalysisView } from '@/types/analysis';

const formValues: AnalysisFormValues = {
  question: 'Qual é a capital do Brasil?',
  userAnswer: 'Rio de Janeiro',
  correctAnswer: 'Brasília',
  officialExplanation: '',
  userAttribution: 'NAO_SABIA_CONTEUDO',
};

const analysis: AnalysisView = {
  id: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
  question: formValues.question,
  userAnswer: formValues.userAnswer,
  correctAnswer: formValues.correctAnswer,
  officialExplanation: null,
  discipline: 'Atualidades',
  probableErrorType: 'KNOWLEDGE_GAP',
  confidence: 0.82,
  reasoningSummary: 'A informação factual precisa ser revisada.',
  recommendedAction: 'Revise a capital atual e a mudança ocorrida em 1960.',
  coreConcept: 'Capital federal',
  cardAction: 'NO_CARD',
  card: null,
  createdAt: '2026-08-28T12:00:00.000Z',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('cliente dos contratos de análise da Sprint 4', () => {
  it('avança com o preview sem depender de token de claim no JSON', async () => {
    const dummyTurnstileToken = ['turnstile', 'validado'].join('-');
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        preview: {
          probableErrorType: 'KNOWLEDGE_GAP',
          concept: 'Capital federal',
          discipline: 'Atualidades',
          isAligned: true,
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const preview = await submitAnonymousPreview(formValues, dummyTurnstileToken);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(preview).toEqual({
      probableErrorType: 'KNOWLEDGE_GAP',
      concept: 'Capital federal',
      discipline: 'Atualidades',
      isAligned: true,
    });
    expect(JSON.parse(String(init.body))).toMatchObject({ turnstileToken: dummyTurnstileToken });
    expect(preview).not.toHaveProperty('claimToken');
  });

  it('bloqueia respostas de preview fora do contrato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, preview: {} })));
    await expect(submitAnonymousPreview(formValues)).rejects.toMatchObject({ kind: 'TEMPORARY' });
  });

  it('classifica falha de rede como recuperável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(submitAnonymousPreview(formValues)).rejects.toMatchObject({ kind: 'NETWORK' });
  });

  it('envia análise autenticada com chave de idempotência', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ analysis }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitAuthenticatedAnalysis(formValues)).resolves.toEqual(analysis);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('faz claim pelo cookie HttpOnly sem enviar token no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, analysis }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(claimPendingAnalysis()).resolves.toEqual(analysis);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  it('distingue token expirado de token inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Esta análise expirou.' }, 410)));
    await expect(claimPendingAnalysis()).rejects.toMatchObject({ kind: 'TOKEN_EXPIRED', status: 410 });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Token inválido.' }, 404)));
    await expect(claimPendingAnalysis()).rejects.toMatchObject({ kind: 'TOKEN_INVALID', status: 404 });
  });

  it('envia disciplina pelo enum e valida a resposta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      discipline: 'Atualidades',
      confirmedDiscipline: 'Português',
      confirmedAt: '2026-08-28T12:00:00.000Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(confirmAnalysisDiscipline(analysis.id, 'Português')).resolves.toMatchObject({
      confirmedDiscipline: 'Português',
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ discipline: 'Português' });
  });

  it('envia feedback separado da análise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      rating: 'YES', comment: 'Ajudou.', updatedAt: '2026-08-28T12:00:00.000Z',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(submitAnalysisFeedback(analysis.id, 'YES', 'Ajudou.')).resolves.toMatchObject({ rating: 'YES' });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({
      rating: 'YES', comment: 'Ajudou.',
    });
  });

  it('preserva uma mensagem segura para erro de API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Serviço temporariamente indisponível.' }, 503)));

    try {
      await submitAuthenticatedAnalysis(formValues);
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error).toBeInstanceOf(AnalysisApiError);
      expect(error).toMatchObject({ kind: 'TEMPORARY', status: 503 });
    }
  });
});
