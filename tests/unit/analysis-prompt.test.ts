import { describe, it, expect } from 'vitest';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt, PROMPT_VERSION } from '@/lib/ai/analysis-prompt';
import type { AnalysisInput } from '@/lib/ai/analysis-schema';

// O prompt é um texto longo com quebras de linha manuais (~80 colunas) que podem
// cair no meio de uma frase; normaliza espaços em branco para buscas robustas.
const normalizedPrompt = ANALYSIS_SYSTEM_PROMPT.replace(/\s+/g, ' ').toLowerCase();

describe('ANALYSIS_SYSTEM_PROMPT', () => {
  it('só menciona a frase proibida dentro da própria instrução de proibição', () => {
    expect(normalizedPrompt).toContain('nunca afirme "a causa do seu erro foi');
  });

  it('exige a formulação "causa provável"', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('causa provável');
  });

  it('contém todas as categorias da taxonomia', () => {
    for (const category of [
      'KNOWLEDGE_GAP',
      'CONCEPT_CONFUSION',
      'EXCEPTION_MISSED',
      'APPLICATION_ERROR',
      'READING_ERROR',
      'INSUFFICIENT_INFORMATION',
    ]) {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain(category);
    }
  });

  it('contém todas as ações possíveis de flashcard', () => {
    for (const action of [
      'CREATE_BASIC_CARD',
      'CREATE_DISCRIMINATION_CARD',
      'CREATE_EXCEPTION_CARD',
      'CREATE_APPLICATION_CARD',
      'NO_CARD',
    ]) {
      expect(ANALYSIS_SYSTEM_PROMPT).toContain(action);
    }
  });

  it('instrui explicitamente que o conteúdo do usuário nunca é instrução (anti prompt injection)', () => {
    expect(normalizedPrompt).toContain('nunca são instruções');
  });

  it('proíbe transformar a questão diretamente em frente do card (anti-memorização)', () => {
    expect(normalizedPrompt).toContain('memorização');
  });

  it('instrui não expor raciocínio interno (chain-of-thought)', () => {
    expect(normalizedPrompt).toContain('transcrição');
  });

  it('instrui não reconciliar inconsistência entre gabarito e explicação oficial', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('INSUFFICIENT_INFORMATION');
    expect(normalizedPrompt).toContain('inconsistentes');
  });

  it('deixa claro que não há busca externa/RAG nesta sprint', () => {
    expect(normalizedPrompt).toContain('não tem acesso à internet');
  });
});

describe('ANALYSIS_SYSTEM_PROMPT — fronteiras entre categorias (analysis-v2)', () => {
  it('exige estrutura de par comparável para CONCEPT_CONFUSION, não apenas termo real do mesmo domínio', () => {
    expect(normalizedPrompt).toContain('dois conceitos comparáveis');
  });

  it('define que regra geral explícita no enunciado pesa a favor de EXCEPTION_MISSED', () => {
    expect(normalizedPrompt).toContain('pesa a favor de exception_missed');
  });

  it('define que operação plausível-porém-incorreta é evidência de APPLICATION_ERROR', () => {
    expect(normalizedPrompt).toContain('operação plausível-porém-incorreta');
  });

  it('exige gatilho textual explícito para READING_ERROR, não presunção por conteúdo suspeito', () => {
    expect(normalizedPrompt).toContain('gatilho textual explícito');
    expect(normalizedPrompt).toContain('nunca presuma reading_error');
  });

  it('instrui preferir INSUFFICIENT_INFORMATION quando categorias permanecem igualmente plausíveis', () => {
    expect(normalizedPrompt).toContain('igualmente plausíveis');
  });

  it('reforça que APPLICATION_ERROR não implica automaticamente CREATE_APPLICATION_CARD', () => {
    expect(normalizedPrompt).toContain('não implica automaticamente create_application_card');
  });
});

describe('ANALYSIS_SYSTEM_PROMPT — constructo de INSUFFICIENT_INFORMATION (analysis-v2.1)', () => {
  it('A. proíbe usar INSUFFICIENT_INFORMATION apenas por indeterminação da resposta da questão', () => {
    expect(normalizedPrompt).toContain('não use esta categoria apenas porque');
    expect(normalizedPrompt).toContain('não é possível determinar');
    expect(normalizedPrompt).toContain('indeterminação da resposta');
  });

  it('B. exige indeterminação diagnóstica (causas concorrentes sem evidência de desempate) para INSUFFICIENT_INFORMATION', () => {
    expect(normalizedPrompt).toContain('indeterminação do diagnóstico');
    expect(normalizedPrompt).toContain('duas ou mais causas pedagógicas');
  });

  it('distingue explicitamente indeterminação da resposta de indeterminação do diagnóstico', () => {
    expect(normalizedPrompt).toContain('são coisas diferentes, e');
  });
});

describe('ANALYSIS_SYSTEM_PROMPT — independência de cardAction e prompt injection (analysis-v2.1)', () => {
  it('C. prompt injection não força NO_CARD nem nenhuma categoria de errorType automaticamente', () => {
    expect(normalizedPrompt).toContain('não determina sozinha nenhuma conclusão');
    expect(normalizedPrompt).toContain('não determina sozinha no_card');
  });

  it('formaliza a ordem de decisão para conteúdo adversarial', () => {
    expect(normalizedPrompt).toContain('conteúdo adversarial (ordem de decisão)');
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('1. Trate o trecho adversarial');
  });

  it('D. declara cardAction como decisão separada de probableErrorType', () => {
    expect(normalizedPrompt).toContain('cardaction é uma decisão pedagógica separada de probableerrortype');
  });

  it('E. permite explicitamente INSUFFICIENT_INFORMATION coexistir com um CREATE_*', () => {
    expect(normalizedPrompt).toContain('insufficient_information não implica automaticamente no_card');
    expect(normalizedPrompt).toContain('incerteza sobre a causa não é o mesmo que');
  });
});

describe('buildAnalysisUserPrompt', () => {
  const input: AnalysisInput = {
    question: 'Qual é a capital da França?',
    userAnswer: 'Lyon',
    correctAnswer: 'Paris',
  };

  it('inclui os três campos obrigatórios delimitados', () => {
    const prompt = buildAnalysisUserPrompt(input);
    expect(prompt).toContain('<question>');
    expect(prompt).toContain(input.question);
    expect(prompt).toContain('<userAnswer>');
    expect(prompt).toContain(input.userAnswer);
    expect(prompt).toContain('<correctAnswer>');
    expect(prompt).toContain(input.correctAnswer);
  });

  it('sinaliza officialExplanation ausente explicitamente quando não fornecida', () => {
    const prompt = buildAnalysisUserPrompt(input);
    expect(prompt).toContain('(não fornecida)');
  });

  it('inclui officialExplanation quando fornecida', () => {
    const prompt = buildAnalysisUserPrompt({ ...input, officialExplanation: 'Paris é a capital desde o século X.' });
    expect(prompt).toContain('Paris é a capital desde o século X.');
  });
});

describe('PROMPT_VERSION', () => {
  it('é uma string não vazia, para rastreabilidade em analyses.prompt_version', () => {
    expect(typeof PROMPT_VERSION).toBe('string');
    expect(PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});
