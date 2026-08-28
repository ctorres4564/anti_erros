import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FullAnalysisResult } from '@/components/analysis/FullAnalysisResult';
import { PartialAnalysisResult } from '@/components/analysis/PartialAnalysisResult';
import {
  getAlignmentMessage,
  getCardDecisionLabel,
  getConfidenceLabel,
  getErrorTypeLabel,
  toConservativeLanguage,
  truncateQuestion,
} from '@/lib/analysis-presentation';
import type { AnalysisView } from '@/types/analysis';

const baseAnalysis: AnalysisView = {
  id: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
  question: 'Qual é a capital do Brasil?',
  userAnswer: 'Rio de Janeiro',
  correctAnswer: 'Brasília',
  officialExplanation: null,
  discipline: 'Atualidades',
  probableErrorType: 'KNOWLEDGE_GAP',
  confidence: 0.82,
  reasoningSummary: 'A resposta indica que a informação factual precisa ser revisada.',
  recommendedAction: 'Revise a capital atual e relacione-a à transferência ocorrida em 1960.',
  coreConcept: 'Capital federal',
  cardAction: 'NO_CARD',
  card: null,
  createdAt: '2026-08-28T12:00:00.000Z',
};

describe('camada de apresentação da Sprint 4', () => {
  it('traduz enums sem expor código técnico', () => {
    expect(getErrorTypeLabel('KNOWLEDGE_GAP')).toBe('Lacuna de Conhecimento');
    expect(getErrorTypeLabel('UNKNOWN')).toBe('Causa ainda não identificada');
  });

  it('apresenta confiança em faixas sem falsa precisão', () => {
    expect(getConfidenceLabel(0.91)).toBe('Confiança operacional mais alta');
    expect(getConfidenceLabel(0.7)).toBe('Confiança operacional moderada');
    expect(getConfidenceLabel(0.3)).toBe('Evidências ainda insuficientes');
  });

  it('usa linguagem conservadora para alinhamento e divergência', () => {
    const messages = [getAlignmentMessage(true), getAlignmentMessage(false)].join(' ');
    expect(messages).toContain('provável');
    expect(messages.toLowerCase()).not.toContain('diagnóstico');
    expect(messages.toLowerCase()).not.toContain('determinou');
  });

  it('neutraliza linguagem assertiva antiga somente na apresentação', () => {
    const displayed = toConservativeLanguage(
      'A IA determinou que esta foi a causa do seu erro. O diagnóstico está fechado.'
    );
    expect(displayed).toContain('com base nas informações fornecidas');
    expect(displayed).toContain('o erro pode estar relacionado a');
    expect(displayed).toContain('a análise permanece provisória');
    expect(displayed.toLowerCase()).not.toContain('diagnóstico');
    expect(displayed.toLowerCase()).not.toContain('determinou');
  });

  it('trunca questões longas sem quebrar as curtas', () => {
    expect(truncateQuestion('Questão curta', 20)).toBe('Questão curta');
    expect(truncateQuestion('Uma questão longa demais para o espaço', 20)).toBe('Uma questão longa…');
  });

  it('renderiza preview apenas com campos parciais e CTA de autenticação', () => {
    const html = renderToStaticMarkup(
      createElement(PartialAnalysisResult, {
        preview: {
          probableErrorType: 'CONCEPT_CONFUSION',
          concept: 'Anulação e revogação',
          discipline: 'Direito Administrativo',
          isAligned: false,
        },
      })
    );

    expect(html).toContain('Resultado parcial');
    expect(html).toContain('Ver análise completa');
    expect(html).not.toContain(baseAnalysis.correctAnswer);
    expect(html).not.toContain(baseAnalysis.recommendedAction);
  });

  it('destaca ação recomendada e explica NO_CARD', () => {
    const html = renderToStaticMarkup(createElement(FullAnalysisResult, { analysis: baseAnalysis }));
    expect(html).toContain('O que fazer agora');
    expect(html).toContain(baseAnalysis.recommendedAction);
    expect(html).toContain('criar um flashcard não é a melhor ação');
    expect(getCardDecisionLabel('NO_CARD')).toBe('Sem flashcard recomendado');
    expect(html).toContain('Qual é a disciplina?');
    expect(html).toContain('Isto ajudou você?');
    expect(html).toContain('não altera a saída original');
  });

  it('mostra somente o flashcard retornado quando a decisão é CREATE', () => {
    const analysis: AnalysisView = {
      ...baseAnalysis,
      cardAction: 'CREATE_BASIC_CARD',
      card: { front: 'Qual é a capital do Brasil?', back: 'Brasília.' },
    };
    const html = renderToStaticMarkup(createElement(FullAnalysisResult, { analysis }));

    expect(html).toContain('Flashcard recomendado');
    expect(html).toContain(analysis.card?.front);
    expect(html).toContain(analysis.card?.back);
    expect(html).not.toContain('criar um flashcard não é a melhor ação');
  });
});
