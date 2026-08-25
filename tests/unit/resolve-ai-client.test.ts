import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

function fakeRequest(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null,
    },
  } as unknown as NextRequest;
}

describe('resolveAIClient', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    process.env.GEMINI_API_KEY = 'fake-key-for-test';
  });

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
    process.env.GEMINI_API_KEY = originalKey;
    vi.unstubAllEnvs();
  });

  it('fora de produção, o header x-test-ai-failure=timeout força um AIAnalysisError TIMEOUT', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { resolveAIClient } = await import('@/lib/ai/resolve-client');
    const client = resolveAIClient(fakeRequest({ 'x-test-ai-failure': 'timeout' }));
    await expect(
      client.analyze({ question: 'q', userAnswer: 'a', correctAnswer: 'b' })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('fora de produção, o header x-test-ai-failure=schema_invalid força SCHEMA_INVALID', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { resolveAIClient } = await import('@/lib/ai/resolve-client');
    const client = resolveAIClient(fakeRequest({ 'x-test-ai-failure': 'schema_invalid' }));
    await expect(
      client.analyze({ question: 'q', userAnswer: 'a', correctAnswer: 'b' })
    ).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('fora de produção, o header x-test-ai-failure=http_error força HTTP_ERROR', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { resolveAIClient } = await import('@/lib/ai/resolve-client');
    const client = resolveAIClient(fakeRequest({ 'x-test-ai-failure': 'http_error' }));
    await expect(
      client.analyze({ question: 'q', userAnswer: 'a', correctAnswer: 'b' })
    ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
  });

  it('sem o header de teste, retorna o client real (Gemini)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { resolveAIClient } = await import('@/lib/ai/resolve-client');
    const { GeminiAnalysisClient } = await import('@/lib/ai/gemini');
    const client = resolveAIClient(fakeRequest({}));
    expect(client).toBeInstanceOf(GeminiAnalysisClient);
  });

  it('em produção, o header de teste é sempre ignorado (nunca força falha)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { resolveAIClient } = await import('@/lib/ai/resolve-client');
    const { GeminiAnalysisClient } = await import('@/lib/ai/gemini');
    const client = resolveAIClient(fakeRequest({ 'x-test-ai-failure': 'timeout' }));
    expect(client).toBeInstanceOf(GeminiAnalysisClient);
  });
});
