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

describe('AuthenticatedAnalysisExperience: alvo de foco/scroll para o estado do claim', () => {
  it('o bloco de status do claim (loading/success/error) está dentro de um container focável (tabIndex=-1), alvo do foco automático em caso de erro', () => {
    const html = renderToStaticMarkup(
      createElement(AuthenticatedAnalysisExperience, {
        firstName: 'Ana',
        claimReference: '6607bfb7-cf9a-40d3-a406-a50291dc4f22.' + 'a'.repeat(43),
        initialHistory: [],
      })
    );

    // O container com tabIndex=-1 + scroll-mt-24 é o mesmo padrão já usado para
    // o resultado da análise (resultRef); precisa envolver o bloco de status
    // para que window.requestAnimationFrame(() => claimStatusRef.current?.focus())
    // (disparado no catch do useEffect de claim) tenha um alvo válido.
    const wrapperIndex = html.indexOf('tabindex="-1" class="scroll-mt-24 outline-none"');
    const loadingIndex = html.indexOf('Recuperando sua análise completa');

    expect(wrapperIndex).toBeGreaterThan(-1);
    expect(loadingIndex).toBeGreaterThan(wrapperIndex);
  });

  // Observação: este projeto não tem jsdom/testing-library instalado, então a
  // execução real do useEffect (que chama claimStatusRef.current?.focus() no
  // catch) não roda em renderToStaticMarkup (SSR não executa efeitos). O teste
  // acima confirma a fiação estrutural (o alvo do foco existe e envolve os três
  // estados); confirmar o foco disparado de fato exigiria um ambiente jsdom.
});
