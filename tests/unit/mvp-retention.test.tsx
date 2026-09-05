import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analysis-api-client', () => ({
  trackActivationEvent: vi.fn(),
  confirmAnalysisDiscipline: vi.fn(),
  submitAnalysisFeedback: vi.fn(),
  requestSimpleExplanation: vi.fn(),
  submitAnonymousPreview: vi.fn(),
  submitAuthenticatedAnalysis: vi.fn(),
  AnalysisApiError: class extends Error {},
}));

import { FullAnalysisResult } from '@/components/analysis/FullAnalysisResult';
import {
  HistorySignals,
  countByErrorType,
  getSampleMaturity,
  getSampleWarning,
  getSignalSentence,
} from '@/components/analysis/HistorySignals';
import { anonymousAnalysisInputSchema, authenticatedAnalysisInputSchema } from '@/lib/ai/analysis-schema';
import { ACTIVATION_EVENTS, activationEventSchema, analysisFeedbackSchema } from '@/lib/engagement-schema';
import {
  buildActionableRecommendation,
  hasConcreteAction,
  EXECUTION_FOLLOW_UP,
  INSUFFICIENT_INFORMATION_FOLLOW_UP,
} from '@/lib/analysis-presentation';
import type { AnalysisHistoryItem, AnalysisView } from '@/types/analysis';

/**
 * Fixture congelado das 24 saídas reais do benchmark gemini-3.6-flash, reduzido
 * aos três campos que a camada de apresentação consome. Serve só para testar a
 * apresentação: não é dependência de runtime e não é reexecutado contra o modelo.
 */
interface RecommendationFixtureCase {
  caseId: string;
  probableErrorType: string;
  recommendedAction: string;
}

const RECOMMENDATION_CASES = JSON.parse(
  readFileSync('tests/fixtures/mvp-retention-recommendations.json', 'utf8')
) as RecommendationFixtureCase[];

function history(errorTypes: string[]): AnalysisHistoryItem[] {
  return errorTypes.map((errorType, index) => ({
    id: `id-${index}`,
    question: `questão ${index}`,
    probableErrorType: errorType,
    recommendedAction: null,
    cardAction: 'NO_CARD',
    discipline: null,
    confirmedDiscipline: null,
    createdAt: new Date(2026, 0, index + 1).toISOString(),
  }));
}

describe('1. redução de atrito no registro', () => {
  const minimo = {
    question: 'Qual é o maior planeta do Sistema Solar?',
    userAnswer: 'Saturno',
    correctAnswer: 'Júpiter',
  };

  it('os três campos essenciais bastam no fluxo anônimo', () => {
    const parsed = anonymousAnalysisInputSchema.safeParse(minimo);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.userAttribution).toBe('NAO_SEI');
  });

  it('os três campos essenciais bastam no fluxo autenticado', () => {
    const parsed = authenticatedAnalysisInputSchema.safeParse(minimo);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.userAttribution).toBe('NAO_SEI');
  });

  it('campos opcionais continuam aceitos quando enviados', () => {
    const parsed = anonymousAnalysisInputSchema.safeParse({
      ...minimo,
      studentReasoning: 'Lembrei dos anéis.',
      userAttribution: 'CONFUNDI_CONCEITOS',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.userAttribution).toBe('CONFUNDI_CONCEITOS');
      expect(parsed.data.studentReasoning).toBe('Lembrei dos anéis.');
    }
  });

  it('os campos essenciais continuam obrigatórios', () => {
    expect(anonymousAnalysisInputSchema.safeParse({ userAnswer: 'a', correctAnswer: 'b' }).success).toBe(false);
    expect(anonymousAnalysisInputSchema.safeParse({ ...minimo, userAnswer: '' }).success).toBe(false);
    expect(anonymousAnalysisInputSchema.safeParse({ ...minimo, correctAnswer: '' }).success).toBe(false);
  });

  it('payload inesperado continua rejeitado (strict preservado)', () => {
    expect(anonymousAnalysisInputSchema.safeParse({ ...minimo, campoInventado: 1 }).success).toBe(false);
  });
});

describe('3. confirmação do diagnóstico', () => {
  it.each(['YES', 'PARTIALLY', 'NO'])('aceita rating %s', (rating) => {
    expect(analysisFeedbackSchema.safeParse({ rating }).success).toBe(true);
  });

  it('comentário é opcional e limitado', () => {
    expect(analysisFeedbackSchema.safeParse({ rating: 'NO', comment: 'errei a leitura' }).success).toBe(true);
    expect(analysisFeedbackSchema.safeParse({ rating: 'NO', comment: 'x'.repeat(501) }).success).toBe(false);
  });

  it('rating inválido é rejeitado', () => {
    expect(analysisFeedbackSchema.safeParse({ rating: 'MAYBE' }).success).toBe(false);
  });
});

describe('4. primeiros sinais do histórico', () => {
  it('faixas de maturidade da amostra', () => {
    expect(getSampleMaturity(0)).toBe('EMPTY');
    expect(getSampleMaturity(1)).toBe('STARTED');
    expect(getSampleMaturity(2)).toBe('STARTED');
    expect(getSampleMaturity(3)).toBe('FIRST_SIGNALS');
    expect(getSampleMaturity(9)).toBe('FIRST_SIGNALS');
    expect(getSampleMaturity(10)).toBe('EMERGING');
    expect(getSampleMaturity(19)).toBe('EMERGING');
    expect(getSampleMaturity(20)).toBe('ESTABLISHED');
  });

  it('conta corretamente por errorType, ordenando por frequência', () => {
    const counts = countByErrorType(
      history(['CONCEPT_CONFUSION', 'APPLICATION_ERROR', 'CONCEPT_CONFUSION', 'KNOWLEDGE_GAP', 'APPLICATION_ERROR'])
    );
    expect(counts).toEqual([
      { errorType: 'APPLICATION_ERROR', count: 2 },
      { errorType: 'CONCEPT_CONFUSION', count: 2 },
      { errorType: 'KNOWLEDGE_GAP', count: 1 },
    ]);
  });

  it('não afirma padrão com 1 ou 2 análises', () => {
    expect(getSignalSentence(history(['KNOWLEDGE_GAP']))).toBeNull();
    expect(getSignalSentence(history(['KNOWLEDGE_GAP', 'KNOWLEDGE_GAP']))).toBeNull();
  });

  it('a partir de 3, descreve sem afirmar causa', () => {
    const sentence = getSignalSentence(history(['KNOWLEDGE_GAP', 'KNOWLEDGE_GAP', 'READING_ERROR']))!;
    expect(sentence).toContain('apareceu mais vezes');
    expect(sentence.toLowerCase()).not.toContain('seu principal problema');
    expect(sentence.toLowerCase()).not.toContain('porque');
  });

  it('empate é reportado como empate, não como padrão', () => {
    const sentence = getSignalSentence(history(['KNOWLEDGE_GAP', 'READING_ERROR', 'APPLICATION_ERROR']))!;
    expect(sentence).toContain('mesma frequência');
  });

  it('aviso de amostra pequena aparece de 3 a 19 e nunca some por completo', () => {
    expect(getSampleWarning(0)).toBeNull();
    expect(getSampleWarning(2)).toBeNull();
    expect(getSampleWarning(5)).toContain('ainda não representam um padrão confiável');
    expect(getSampleWarning(10)).toContain('indício');
    expect(getSampleWarning(20)).toContain('não explicam sozinhos a causa');
  });

  it.each([
    [0, false],
    [1, true],
    [3, true],
    [5, true],
    [10, true],
    [20, true],
  ])('renderiza corretamente com %i erros', (total, deveRenderizar) => {
    const html = renderToStaticMarkup(
      createElement(HistorySignals, { items: history(Array.from({ length: total }, () => 'KNOWLEDGE_GAP')) })
    );
    if (!deveRenderizar) {
      expect(html).toBe('');
      return;
    }
    expect(html).toContain('Seus primeiros sinais');
    expect(html).toContain(total === 1 ? 'analisou 1 erro' : `analisou ${total} erros`);
    if (total <= 2) {
      expect(html).not.toContain('apareceu mais vezes');
    } else {
      expect(html).toContain('apareceu mais vezes');
    }
  });

  it('com histórico pequeno o aviso é exibido junto do resumo', () => {
    const html = renderToStaticMarkup(
      createElement(HistorySignals, { items: history(['KNOWLEDGE_GAP', 'READING_ERROR', 'KNOWLEDGE_GAP']) })
    );
    expect(html).toContain('ainda não representam um padrão confiável');
  });
});

describe('5. instrumentação', () => {
  it('history_summary_viewed é um evento válido e não exige analysisId', () => {
    expect(ACTIVATION_EVENTS).toContain('history_summary_viewed');
    expect(activationEventSchema.safeParse({ eventName: 'history_summary_viewed' }).success).toBe(true);
  });

  it('full_result_viewed continua exigindo analysisId', () => {
    expect(activationEventSchema.safeParse({ eventName: 'full_result_viewed' }).success).toBe(false);
  });

  it('o payload do evento não carrega conteúdo pedagógico', () => {
    const parsed = activationEventSchema.safeParse({
      eventName: 'history_summary_viewed',
      question: 'texto sensível',
    });
    // .strict() rejeita qualquer campo extra
    expect(parsed.success).toBe(false);
  });
});

describe('2b. complemento acionável da recomendação (camada de apresentação)', () => {
  const FALLBACK = 'Refaça esta questão sem consultar a resolução e compare cada etapa com o gabarito.';

  it('KNOWLEDGE_GAP com "Estude X" recebe passo de execução/verificação', () => {
    const r = buildActionableRecommendation({ recommendedAction: 'Estude as funções das principais organelas celulares vegetais, diferenciando a função do cloroplasto da mitocôndria.', fallbackAction: FALLBACK });
    expect(r.action).toContain('Estude as funções das principais organelas');
    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
    expect(r.followUp).toContain('refaça esta questão');
    expect(r.followUp).toContain('confirme');
  });

  it('"Revise X" também recebe complemento', () => {
    const r = buildActionableRecommendation({ recommendedAction: 'Revise as capitais da Oceania.', fallbackAction: FALLBACK });
    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
  });

  it('recomendação já concreta NÃO recebe complemento duplicado', () => {
    const r = buildActionableRecommendation({ recommendedAction: 'Revise a função das enzimas digestivas. Faça um estudo comparativo entre lactase, amilase e protease.', fallbackAction: FALLBACK });
    expect(r.followUp).toBeNull();
  });

  it('READING_ERROR já acionável permanece intacto', () => {
    const original =
      "Sublinhe ou destaque palavras-chave de comando como 'FALSA', 'INCORRETA' ou 'EXCETO' durante a leitura do enunciado.";
    const r = buildActionableRecommendation({ recommendedAction: original, fallbackAction: FALLBACK });
    expect(r.action).toBe(original);
    expect(r.followUp).toBeNull();
  });

  it('APPLICATION_ERROR já acionável permanece intacto', () => {
    const original =
      'Ao balancear reações de combustão, siga sempre a sequência: balanceie primeiro C, depois H e, por último, o O2.';
    const r = buildActionableRecommendation({ recommendedAction: original, fallbackAction: FALLBACK });
    expect(r.action).toBe(original);
    expect(r.followUp).toBeNull();
  });

  it('recomendação vazia/ausente cai no fallback, que já é concreto', () => {
    for (const vazio of [null, undefined, '', '   ']) {
      const r = buildActionableRecommendation({ recommendedAction: vazio, fallbackAction: FALLBACK });
      expect(r.action).toBe(FALLBACK);
      expect(r.followUp).toBeNull();
    }
  });

  it('gerúndio não conta como ação concreta (não fecha "como sei que terminei?")', () => {
    expect(hasConcreteAction('Revise o papel das organelas, destacando os ribossomos.')).toBe(false);
    expect(hasConcreteAction('Destaque os ribossomos.')).toBe(true);
  });

  it('o complemento nunca introduz conteúdo da matéria', () => {
    const r = buildActionableRecommendation({ recommendedAction: 'Revise fotossíntese.', fallbackAction: FALLBACK });
    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
    // o passo é puramente comportamental: não cita nenhum termo da matéria
    for (const termo of ['fotossíntese', 'cloroplasto', 'organela', 'mitocôndria']) {
      expect(r.followUp!.toLowerCase()).not.toContain(termo);
    }
  });

  it('a função é pura: não modifica o objeto de análise nem chama IA', () => {
    const analysis = { recommendedAction: 'Revise as capitais da Oceania.', probableErrorType: 'KNOWLEDGE_GAP' };
    const snapshot = JSON.stringify(analysis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    buildActionableRecommendation({ recommendedAction: analysis.recommendedAction, fallbackAction: FALLBACK });

    expect(JSON.stringify(analysis)).toBe(snapshot);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('aplicado às 24 saídas reais do gemini-3.6-flash, preserva todas e complementa só as não concretas', () => {
    const acoes = RECOMMENDATION_CASES.map((c) => c.recommendedAction).filter(Boolean);

    expect(acoes).toHaveLength(24);
    const complementadas = acoes.filter((a) => buildActionableRecommendation({ recommendedAction: a, fallbackAction: FALLBACK }).followUp !== null);

    // a ação original é sempre preservada, complementada ou não
    for (const a of acoes) expect(buildActionableRecommendation({ recommendedAction: a, fallbackAction: FALLBACK }).action).toBe(a);
    // e o complemento é seletivo: nem todas, nem nenhuma
    expect(complementadas.length).toBeGreaterThan(0);
    expect(complementadas.length).toBeLessThan(24);
  });
});

describe('2c. follow-up específico para INSUFFICIENT_INFORMATION', () => {
  const FALLBACK = 'Refaça esta questão sem consultar a resolução e compare cada etapa com o gabarito.';

  it('INSUFFICIENT_INFORMATION + recomendação não acionável recebe o passo de obtenção de raciocínio', () => {
    const r = buildActionableRecommendation({
      recommendedAction: 'Revise as capitais da Oceania, fixando que Camberra é a capital da Austrália.',
      fallbackAction: FALLBACK,
      probableErrorType: 'INSUFFICIENT_INFORMATION',
    });

    expect(r.followUp).toBe(INSUFFICIENT_INFORMATION_FOLLOW_UP);
    expect(r.followUp).not.toBe(EXECUTION_FOLLOW_UP);
    expect(r.followUp).toContain('escreva em uma frase como você chegou à resposta');
  });

  it('INSUFFICIENT_INFORMATION com recomendação já concreta não recebe texto redundante', () => {
    const original =
      'Para calcular a vazão constante, divida o volume total pelo tempo decorrido e sempre anote as etapas do cálculo.';
    const r = buildActionableRecommendation({
      recommendedAction: original,
      fallbackAction: FALLBACK,
      probableErrorType: 'INSUFFICIENT_INFORMATION',
    });

    expect(r.action).toBe(original);
    expect(r.followUp).toBeNull();
  });

  it('KNOWLEDGE_GAP não recebe o follow-up de insufficient information', () => {
    const r = buildActionableRecommendation({
      recommendedAction: 'Estude as funções das principais organelas celulares.',
      fallbackAction: FALLBACK,
      probableErrorType: 'KNOWLEDGE_GAP',
    });

    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
    expect(r.followUp).not.toBe(INSUFFICIENT_INFORMATION_FOLLOW_UP);
  });

  it('READING_ERROR não recebe o follow-up de insufficient information', () => {
    const r = buildActionableRecommendation({
      recommendedAction: 'Releia o enunciado com atenção aos conectivos temporais.',
      fallbackAction: FALLBACK,
      probableErrorType: 'READING_ERROR',
    });

    expect(r.followUp).not.toBe(INSUFFICIENT_INFORMATION_FOLLOW_UP);
    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
  });

  it('sem probableErrorType, mantém o comportamento genérico', () => {
    const r = buildActionableRecommendation({
      recommendedAction: 'Revise o conteúdo de porcentagem.',
      fallbackAction: FALLBACK,
    });
    expect(r.followUp).toBe(EXECUTION_FOLLOW_UP);
  });

  it('nenhum texto determinístico afirma causa nem promete descobri-la', () => {
    for (const texto of [EXECUTION_FOLLOW_UP, INSUFFICIENT_INFORMATION_FOLLOW_UP]) {
      const lower = texto.toLowerCase();
      expect(lower).not.toContain('porque você');
      expect(lower).not.toContain('seu erro foi');
      expect(lower).not.toContain('a causa é');
      expect(lower).not.toContain('vamos descobrir');
      expect(lower).not.toContain('o sistema vai');
      expect(lower).not.toMatch(/você (não sabe|confundiu|errou porque)/);
    }
    // o específico é epistemicamente conservador
    expect(INSUFFICIENT_INFORMATION_FOLLOW_UP).toContain('mais informação para entender');
  });

  it('não cria chamada de IA nem modifica o objeto de análise', () => {
    const analysis = {
      recommendedAction: 'Revise as capitais da Oceania.',
      probableErrorType: 'INSUFFICIENT_INFORMATION',
    };
    const snapshot = JSON.stringify(analysis);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    buildActionableRecommendation({
      recommendedAction: analysis.recommendedAction,
      fallbackAction: FALLBACK,
      probableErrorType: analysis.probableErrorType,
    });

    expect(JSON.stringify(analysis)).toBe(snapshot);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('distribuição nas 24 saídas reais: genérico, específico e sem complemento', () => {
    let generico = 0;
    let especifico = 0;
    let nenhum = 0;

    for (const c of RECOMMENDATION_CASES) {
      const acao = c.recommendedAction;
      if (!acao) continue;
      const r = buildActionableRecommendation({
        recommendedAction: acao,
        fallbackAction: FALLBACK,
        probableErrorType: c.probableErrorType,
      });
      expect(r.action).toBe(acao); // original sempre preservado
      if (r.followUp === null) nenhum++;
      else if (r.followUp === INSUFFICIENT_INFORMATION_FOLLOW_UP) especifico++;
      else generico++;
    }

    expect(generico + especifico + nenhum).toBe(24);
    // fixture congelado ⇒ a distribuição é exata, não apenas "não vazia"
    expect(generico).toBe(9);
    expect(especifico).toBe(4);
    expect(nenhum).toBe(11);
    console.log(`24-CASE: generico=${generico} especifico=${especifico} nenhum=${nenhum}`);
  });
});

describe('2d. o card "Próxima ação" não repete o reasoningSummary', () => {
  const RESUMO = 'A resposta indica que a informação factual precisa ser revisada em profundidade.';

  const base: AnalysisView = {
    id: 'a6d1e4f0-0f0e-4c1c-9c2b-9a1f0e2d3c44',
    question: 'Qual é a capital da Austrália?',
    userAnswer: 'Sydney',
    correctAnswer: 'Camberra',
    studentReasoning: null,
    discipline: 'Geografia',
    probableErrorType: 'KNOWLEDGE_GAP',
    confidence: 0.8,
    reasoningSummary: RESUMO,
    recommendedAction: 'Revise as capitais da Oceania, fixando que Camberra é a capital oficial da Austrália.',
    coreConcept: 'Capitais da Oceania',
    cardAction: 'NO_CARD',
    card: null,
    createdAt: '2026-09-01T12:00:00.000Z',
  };

  /** Recorta o HTML do card, entre o título "Próxima ação" e o bloco seguinte. */
  function nextActionCard(html: string): string {
    const start = html.indexOf('Próxima ação');
    expect(start).toBeGreaterThan(-1);
    const end = html.indexOf('Ainda com dúvida', start);
    expect(end).toBeGreaterThan(start);
    return html.slice(start, end);
  }

  function render(analysis: AnalysisView): string {
    return renderToStaticMarkup(createElement(FullAnalysisResult, { analysis }));
  }

  it('1. o reasoningSummary continua sendo exibido em "Causa provável"', () => {
    const html = render(base);
    const causa = html.slice(html.indexOf('Causa provável'), html.indexOf('Próxima ação'));

    expect(causa).toContain(RESUMO);
    expect(causa).toContain('Lacuna de Conhecimento');
  });

  it('2. o reasoningSummary NÃO é repetido dentro de "Próxima ação"', () => {
    const html = render(base);

    expect(nextActionCard(html)).not.toContain(RESUMO);
    expect(nextActionCard(html)).not.toContain('Por quê');
    // e aparece uma única vez na página inteira
    expect(html.split(RESUMO).length - 1).toBe(1);
  });

  it('3. a recommendedAction original continua intacta no card', () => {
    const card = nextActionCard(render(base));
    expect(card).toContain(base.recommendedAction);
  });

  it('4. o follow-up genérico continua aparecendo quando aplicável', () => {
    const card = nextActionCard(render(base));

    expect(card).toContain(EXECUTION_FOLLOW_UP);
    expect(card).not.toContain(INSUFFICIENT_INFORMATION_FOLLOW_UP);
  });

  it('5. o follow-up de INSUFFICIENT_INFORMATION continua aparecendo quando aplicável', () => {
    const card = nextActionCard(render({ ...base, probableErrorType: 'INSUFFICIENT_INFORMATION' }));

    expect(card).toContain(INSUFFICIENT_INFORMATION_FOLLOW_UP);
    expect(card).not.toContain(EXECUTION_FOLLOW_UP);
  });

  it('6. o caso sem follow-up mostra só a ação, sem nenhum texto extra', () => {
    const acaoConcreta =
      'Ao realizar questões de interpretação textual, sublinhe os adjetivos antes de responder.';
    const card = nextActionCard(
      render({ ...base, probableErrorType: 'READING_ERROR', recommendedAction: acaoConcreta })
    );

    expect(card).toContain(acaoConcreta);
    expect(card).not.toContain(EXECUTION_FOLLOW_UP);
    expect(card).not.toContain(INSUFFICIENT_INFORMATION_FOLLOW_UP);
    expect(card).not.toContain(RESUMO);
  });
});
