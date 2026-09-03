import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logClaimEvent } from '@/lib/observability/claim-log';

describe('logClaimEvent: instrumentação não sensível do fluxo de claim', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('registra o evento com timestamp e apenas os campos passados', () => {
    logClaimEvent('pending_preview_created', {
      pendingAnalysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
    });

    expect(logSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);

    expect(payload.event).toBe('pending_preview_created');
    expect(payload.pendingAnalysisId).toBe('6607bfb7-cf9a-40d3-a406-a50291dc4f22');
    expect(typeof payload.timestamp).toBe('string');
    expect(Object.keys(payload).sort()).toEqual(['event', 'pendingAnalysisId', 'timestamp']);
  });

  it('com todos os campos preenchidos, a linha logada contém somente identificadores e metadados técnicos', () => {
    logClaimEvent('pending_claim_succeeded', {
      pendingAnalysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
      analysisId: '9f418171-3f8c-47c0-9f31-17c763efdca1',
      stage: 'claim_service',
      status: 'CLAIMED',
      found: true,
      errorKind: 'NONE',
    });

    const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
    const keys = Object.keys(payload).sort();

    expect(keys).toEqual(
      ['analysisId', 'errorKind', 'event', 'found', 'pendingAnalysisId', 'stage', 'status', 'timestamp'].sort()
    );
    // Nenhuma dessas chaves é capaz de carregar token, claim_ref completo, hash, e-mail ou conteúdo da questão.
    expect(keys).not.toContain('claimToken');
    expect(keys).not.toContain('claimReference');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('question');
    expect(keys).not.toContain('cookie');
  });

  it('não vaza padrão de hash SHA-256 (64 hex) nem token de 64 caracteres em nenhuma chamada', () => {
    logClaimEvent('pending_claim_failed', {
      pendingAnalysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
      stage: 'cookie_missing',
      errorKind: 'reference_unverified',
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).not.toMatch(/[0-9a-f]{64}/i);
  });
});
