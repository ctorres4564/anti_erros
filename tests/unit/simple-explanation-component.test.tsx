import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestSimpleExplanation: vi.fn() }));

vi.mock('@/lib/analysis-api-client', () => ({
  requestSimpleExplanation: mocks.requestSimpleExplanation,
  confirmAnalysisDiscipline: vi.fn(),
  submitAnalysisFeedback: vi.fn(),
  trackActivationEvent: vi.fn(),
}));

import {
  SimpleExplanation,
  simpleExplanationButtonLabel,
  SIMPLE_EXPLANATION_BUTTON_LABEL,
  SIMPLE_EXPLANATION_ERROR_MESSAGE,
  SIMPLE_EXPLANATION_LOADING_LABEL,
} from '@/components/analysis/SimpleExplanation';

const props = {
  question: 'Qual é o maior planeta do Sistema Solar?',
  correctAnswer: 'Júpiter',
  userAnswer: 'Saturno',
  concept: 'Tamanho dos planetas',
};

describe('SimpleExplanation: nada acontece antes do clique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderizar o componente não dispara nenhuma chamada à API', () => {
    renderToStaticMarkup(createElement(SimpleExplanation, props));

    expect(mocks.requestSimpleExplanation).not.toHaveBeenCalled();
  });

  it('mostra o botão com o rótulo especificado e nenhuma explicação ou erro no estado inicial', () => {
    const html = renderToStaticMarkup(createElement(SimpleExplanation, props));

    expect(html).toContain(SIMPLE_EXPLANATION_BUTTON_LABEL);
    expect(html).not.toContain(SIMPLE_EXPLANATION_LOADING_LABEL);
    expect(html).not.toContain(SIMPLE_EXPLANATION_ERROR_MESSAGE);
  });

  it('não exibe nenhuma classificação de erro nem flashcard', () => {
    const html = renderToStaticMarkup(createElement(SimpleExplanation, props));

    expect(html).not.toContain('Causa provável');
    expect(html).not.toContain('Flashcard');
  });
});

describe('SimpleExplanation: textos por estado', () => {
  it('estado inicial usa o rótulo do botão especificado', () => {
    expect(simpleExplanationButtonLabel({ status: 'idle' })).toBe('Explique de forma simples');
  });

  it('durante a chamada mostra o texto de carregamento especificado', () => {
    expect(simpleExplanationButtonLabel({ status: 'loading' })).toBe('Preparando uma explicação simples...');
  });

  it('após sucesso ou erro permite pedir novamente', () => {
    expect(simpleExplanationButtonLabel({ status: 'success', explanation: 'texto' })).toBe('Explicar novamente');
    expect(simpleExplanationButtonLabel({ status: 'error' })).toBe('Explicar novamente');
  });

  it('a mensagem de erro é exatamente a especificada', () => {
    expect(SIMPLE_EXPLANATION_ERROR_MESSAGE).toBe(
      'Não foi possível gerar a explicação agora. Tente novamente.'
    );
  });
});
