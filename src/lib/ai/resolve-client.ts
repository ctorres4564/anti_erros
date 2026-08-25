import type { NextRequest } from 'next/server';
import { AIAnalysisError, createGeminiAnalysisClient, type AIAnalysisClient } from './gemini';

/**
 * Resolve o client de IA a ser usado pela rota. Fora de produção (e somente
 * fora de produção), permite injetar uma falha determinística via o header
 * `x-test-ai-failure`, exclusivamente para viabilizar testes E2E reais do
 * fluxo de falha (seção 64 da Sprint 3) sem depender da instabilidade de uma
 * chamada real ao Gemini para produzir cada tipo de erro. Em produção este
 * header é sempre ignorado e o client real é sempre usado.
 */
export function resolveAIClient(request: NextRequest): AIAnalysisClient {
  if (process.env.NODE_ENV !== 'production') {
    const forced = request.headers.get('x-test-ai-failure');
    if (forced === 'timeout') {
      return { analyze: () => Promise.reject(new AIAnalysisError('TIMEOUT', 'Timeout forçado para teste E2E.')) };
    }
    if (forced === 'schema_invalid') {
      return {
        analyze: () => Promise.reject(new AIAnalysisError('SCHEMA_INVALID', 'Schema inválido forçado para teste E2E.')),
      };
    }
    if (forced === 'http_error') {
      return { analyze: () => Promise.reject(new AIAnalysisError('HTTP_ERROR', 'Erro HTTP forçado para teste E2E.')) };
    }
  }

  return createGeminiAnalysisClient();
}
