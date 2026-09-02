import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  INTENDED_MODEL,
  EXPECTED_CASE_COUNT,
  parseCliArgs,
  validateCliModel,
  verifyFreezeManifest,
  isCaseCountValid,
  FREEZE_MANIFEST_PATH,
} from './run-holdout-v24-blind';

/**
 * Testes ESTÁTICOS do runner selado — NENHUM chama o Gemini. Cobre os cenários
 * A-G exigidos antes de qualquer autorização de execução real.
 */

describe('A. sem --model -> aborta', () => {
  it('validateCliModel retorna motivo de ABORT quando --model está ausente', () => {
    const args = parseCliArgs([]);
    expect(args.model).toBeUndefined();
    const reason = validateCliModel(args);
    expect(reason).not.toBeNull();
    expect(reason).toContain('MODEL_ARG_MISSING');
  });
});

describe('B. --model=gemini-3.6-flash -> aborta', () => {
  it('validateCliModel rejeita modelo diferente do selado (3.6)', () => {
    const args = parseCliArgs(['--model=gemini-3.6-flash']);
    const reason = validateCliModel(args);
    expect(reason).not.toBeNull();
    expect(reason).toContain('MODEL_ARG_MISMATCH');
  });
});

describe('C. --model=gemini-2.5-flash -> aborta', () => {
  it('validateCliModel rejeita modelo diferente do selado (2.5)', () => {
    const args = parseCliArgs(['--model=gemini-2.5-flash']);
    const reason = validateCliModel(args);
    expect(reason).not.toBeNull();
    expect(reason).toContain('MODEL_ARG_MISMATCH');
  });
});

describe('D. --model=gemini-3.7-flash sem --execute-blind -> somente preflight', () => {
  it('aceita o modelo selado e mantém executeBlind=false por padrão', () => {
    const args = parseCliArgs(['--model=gemini-3.7-flash']);
    expect(validateCliModel(args)).toBeNull();
    expect(args.model).toBe(INTENDED_MODEL);
    expect(args.executeBlind).toBe(false);
  });

  it('só liga executeBlind quando --execute-blind é passado explicitamente', () => {
    const args = parseCliArgs(['--model=gemini-3.7-flash', '--execute-blind']);
    expect(args.executeBlind).toBe(true);
  });
});

describe('E. hash incorreto -> aborta', () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('verifyFreezeManifest falha quando o SHA-256 registrado não bate com o arquivo real', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'holdout-v24-hash-test-'));
    const fakeCasesPath = path.join(tmpDir, 'fake-cases.ts');
    writeFileSync(fakeCasesPath, 'export const X = 1;', 'utf-8');

    const fakeManifestPath = path.join(tmpDir, 'fake-freeze.json');
    writeFileSync(
      fakeManifestPath,
      JSON.stringify({
        instrument: 'holdout-v24-blind',
        status: 'FROZEN',
        caseCount: EXPECTED_CASE_COUNT,
        caseIds: Array.from({ length: 40 }, (_, i) => `BD${String(i + 1).padStart(2, '0')}`),
        gates: { gateA: {}, gateB: {}, gateC: {}, gateD: {}, gateE: {}, gateF: {}, gateG: {}, gateH: {} },
        files: [{ path: 'fake-cases.ts', bytes: 999999, sha256: '0'.repeat(64) }],
      }),
      'utf-8'
    );

    const result = verifyFreezeManifest(tmpDir, fakeManifestPath);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.includes('SHA-256 diverge'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('bytes divergem'))).toBe(true);
  });

  it('verifyFreezeManifest PASSA no manifesto real congelado atual (autoverificação)', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const result = verifyFreezeManifest(repoRoot);
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

describe('F. case count != 40 -> aborta', () => {
  it('isCaseCountValid rejeita qualquer contagem diferente de 40', () => {
    expect(isCaseCountValid(40)).toBe(true);
    expect(isCaseCountValid(39)).toBe(false);
    expect(isCaseCountValid(41)).toBe(false);
    expect(isCaseCountValid(0)).toBe(false);
  });
});

describe('G. nenhum destes cenários chama Gemini', () => {
  it('fetch nunca é invocado ao rodar as funções puras de validação/preflight', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch NÃO deveria ser chamado nesta bateria de testes estáticos.');
    });
    vi.stubGlobal('fetch', fetchSpy);

    try {
      // Cenários A-D
      validateCliModel(parseCliArgs([]));
      validateCliModel(parseCliArgs(['--model=gemini-3.6-flash']));
      validateCliModel(parseCliArgs(['--model=gemini-2.5-flash']));
      validateCliModel(parseCliArgs(['--model=gemini-3.7-flash']));
      // Cenário E/F
      isCaseCountValid(40);
      isCaseCountValid(39);
      verifyFreezeManifest(path.resolve(__dirname, '..', '..'));

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('FREEZE_MANIFEST_PATH aponta para o arquivo já congelado, não para um caminho novo/gerado por este teste', () => {
    expect(FREEZE_MANIFEST_PATH.replace(/\\/g, '/')).toContain('scripts/benchmark/holdout-v24-blind-freeze.json');
  });
});
