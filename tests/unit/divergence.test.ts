import { describe, it, expect } from 'vitest';
import { calculateDivergence, USER_ATTRIBUTIONS, PROBABLE_ERROR_TYPES } from '@/config/ai';

describe('calculateDivergence (PRD v1.2)', () => {
  it('identifica alinhamento quando a autopercepção corresponde ao tipo diagnosticado', () => {
    const cases = [
      { attr: 'NAO_SABIA_CONTEUDO' as const, type: 'KNOWLEDGE_GAP' as const },
      { attr: 'CONFUNDI_CONCEITOS' as const, type: 'CONCEPT_CONFUSION' as const },
      { attr: 'ESQUECI_EXCECAO' as const, type: 'EXCEPTION_MISSED' as const },
      { attr: 'ERRO_APLICACAO' as const, type: 'APPLICATION_ERROR' as const },
      { attr: 'ERRO_LEITURA' as const, type: 'READING_ERROR' as const },
    ];

    for (const { attr, type } of cases) {
      const result = calculateDivergence(attr, type);
      expect(result.isAligned).toBe(true);
      expect(result.message).toContain('está alinhada');
    }
  });

  it('identifica divergência quando a autopercepção difere do diagnóstico', () => {
    const result = calculateDivergence('CONFUNDI_CONCEITOS', 'READING_ERROR');
    expect(result.isAligned).toBe(false);
    expect(result.message).toContain('Você achou que errou por');
    expect(result.message).toContain('Erro de Leitura/Interpretação');
  });

  it('trata "NAO_SEI" como não alinhado com mensagem pedagógica acolhedora', () => {
    const result = calculateDivergence('NAO_SEI', 'KNOWLEDGE_GAP');
    expect(result.isAligned).toBe(false);
    expect(result.message).toContain('Você indicou que não sabia identificar a causa');
  });

  it('cobre todas as combinações de autopercepção e tipos sem lançar exceção', () => {
    for (const attr of USER_ATTRIBUTIONS) {
      for (const type of PROBABLE_ERROR_TYPES) {
        const result = calculateDivergence(attr, type);
        expect(typeof result.isAligned).toBe('boolean');
        expect(result.message.length).toBeGreaterThan(0);
      }
    }
  });
});
