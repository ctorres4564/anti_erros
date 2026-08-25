import { describe, it, expect } from 'vitest';
import { buildAnalysisUserPrompt } from '@/lib/ai/analysis-prompt';
import { analysisInputSchema } from '@/lib/ai/analysis-schema';
import { USER_ATTRIBUTIONS } from '@/config/ai';

describe('PRD v1.2: Teste Obrigatório de Anti-Contaminação (user_attribution)', () => {
  it('garante que o schema de entrada para a IA rejeita estritamente qualquer campo user_attribution', () => {
    const inputWithAttribution = {
      question: 'Qual é o quórum para aprovação de emenda constitucional?',
      userAnswer: 'Maioria simples',
      correctAnswer: '3/5 dos membros',
      user_attribution: 'NAO_SABIA_CONTEUDO',
    };

    const result = analysisInputSchema.safeParse(inputWithAttribution);
    expect(result.success).toBe(false);
  });

  it('garante que o construtor do prompt de usuário não inclui menção à percepção do usuário', () => {
    const input = {
      question: 'Em que hipótese ocorre a responsabilidade objetiva do Estado?',
      userAnswer: 'Dano causado por força maior',
      correctAnswer: 'Ato de agente público no exercício da função',
      officialExplanation: 'Artigo 37, §6º da CF/88.',
    };

    const prompt = buildAnalysisUserPrompt(input);

    // Verificar que tags esperadas existem
    expect(prompt).toContain('<question>');
    expect(prompt).toContain('<userAnswer>');
    expect(prompt).toContain('<correctAnswer>');
    expect(prompt).toContain('<officialExplanation>');

    // Verificar que NENHUMA das taxonomias de autopercepção aparece no prompt
    for (const attr of USER_ATTRIBUTIONS) {
      expect(prompt).not.toContain(attr);
    }

    expect(prompt).not.toContain('user_attribution');
    expect(prompt).not.toContain('autopercepção');
    expect(prompt).not.toContain('o usuário acha que errou por');
  });
});
