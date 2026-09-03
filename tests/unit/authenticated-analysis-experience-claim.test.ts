import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AuthenticatedAnalysisExperience,
  claimErrorMessage,
} from '@/components/analysis/AuthenticatedAnalysisExperience';
import { AnalysisApiError } from '@/lib/analysis-api-client';

describe('claimErrorMessage nunca produz mensagem vazia (não há falha silenciosa)', () => {
  it.each([
    'TOKEN_EXPIRED',
    'TOKEN_INVALID',
    'AUTH',
    'ONBOARDING',
    'LIMIT',
    'VALIDATION',
    'IN_PROGRESS',
    'TEMPORARY',
    'UNKNOWN',
  ] as const)('kind %s sempre retorna mensagem visível ao usuário', (kind) => {
    const message = claimErrorMessage(new AnalysisApiError('falha', kind, 400));
    expect(message.length).toBeGreaterThan(0);
  });

  it('erro de rede retorna a própria mensagem, não silêncio', () => {
    const message = claimErrorMessage(new AnalysisApiError('Sem internet.', 'NETWORK'));
    expect(message).toBe('Sem internet.');
  });

  it('erro não tipado ainda assim retorna mensagem genérica visível', () => {
    expect(claimErrorMessage(new Error('boom')).length).toBeGreaterThan(0);
  });
});

describe('AuthenticatedAnalysisExperience: estado inicial nunca fica "idle" quando há claim_ref', () => {
  it('B/A) com claimReference presente, o render inicial já mostra o estado de carregamento do claim (não idle)', () => {
    const html = renderToStaticMarkup(
      createElement(AuthenticatedAnalysisExperience, {
        firstName: 'Ana',
        claimReference: '6607bfb7-cf9a-40d3-a406-a50291dc4f22.' + 'a'.repeat(43),
        initialHistory: [],
      })
    );

    expect(html).toContain('Recuperando sua análise completa');
  });

  it('D) sem claimReference, o fluxo normal não mostra nenhum estado de claim', () => {
    const html = renderToStaticMarkup(
      createElement(AuthenticatedAnalysisExperience, {
        firstName: 'Ana',
        claimReference: null,
        initialHistory: [],
      })
    );

    expect(html).not.toContain('Recuperando sua análise completa');
    expect(html).not.toContain('Análise vinculada à sua conta com sucesso');
  });
});
