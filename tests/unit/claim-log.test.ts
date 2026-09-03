import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logClaimEvent, safePendingAnalysisId } from '@/lib/observability/claim-log';

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

  it('os campos de rastreio do fluxo pré-claim são booleanos e enum controlado, sem URL nem referência', () => {
    logClaimEvent('auth_confirm_redirect', {
      hasClaimReference: true,
      pendingAnalysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
      destination: 'app_with_claim',
    });
    logClaimEvent('app_page_claim_state', {
      hasClaimRefParam: true,
      claimRefStructurallyValid: true,
      pendingAnalysisId: '6607bfb7-cf9a-40d3-a406-a50291dc4f22',
    });

    const redirectPayload = JSON.parse(logSpy.mock.calls[0][0] as string);
    const appPayload = JSON.parse(logSpy.mock.calls[1][0] as string);

    expect(redirectPayload.destination).toBe('app_with_claim');
    expect(redirectPayload.hasClaimReference).toBe(true);
    expect(appPayload.hasClaimRefParam).toBe(true);
    expect(appPayload.claimRefStructurallyValid).toBe(true);

    const allLoggedText = logSpy.mock.calls.map(([line]) => line).join('\n');
    expect(allLoggedText).not.toContain('claim_ref=');
    expect(allLoggedText).not.toContain('http');
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

describe('safePendingAnalysisId: extrai só o identificador, nunca a assinatura', () => {
  const pendingId = '6607bfb7-cf9a-40d3-a406-a50291dc4f22';
  const signature = 'a'.repeat(43);

  it('devolve apenas o pendingAnalysisId de uma referência bem formada', () => {
    const extracted = safePendingAnalysisId(`${pendingId}.${signature}`);

    expect(extracted).toBe(pendingId);
    expect(extracted).not.toContain(signature);
    expect(extracted).not.toContain('.');
  });

  it.each([null, undefined, '', 'referencia-invalida', 'sem-ponto', `${pendingId}`])(
    'devolve null para entrada inválida ou ausente (%s)',
    (input) => {
      expect(safePendingAnalysisId(input)).toBeNull();
    }
  );
});
