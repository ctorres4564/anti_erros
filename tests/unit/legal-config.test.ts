import { describe, it, expect } from 'vitest';
import { LEGAL_VERSIONS } from '@/config/legal';

describe('Sprint 2: Configuração Centralizada de Versões Legais', () => {
  it('deve possuir versão válida para os Termos de Uso', () => {
    expect(LEGAL_VERSIONS.terms).toBeDefined();
    expect(typeof LEGAL_VERSIONS.terms).toBe('string');
    expect(LEGAL_VERSIONS.terms.length).toBeGreaterThan(0);
    expect(LEGAL_VERSIONS.terms).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('deve possuir versão válida para a Política de Privacidade', () => {
    expect(LEGAL_VERSIONS.privacy).toBeDefined();
    expect(typeof LEGAL_VERSIONS.privacy).toBe('string');
    expect(LEGAL_VERSIONS.privacy.length).toBeGreaterThan(0);
    expect(LEGAL_VERSIONS.privacy).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('deve possuir versão válida para a Política de Marketing', () => {
    expect(LEGAL_VERSIONS.marketing).toBeDefined();
    expect(typeof LEGAL_VERSIONS.marketing).toBe('string');
    expect(LEGAL_VERSIONS.marketing.length).toBeGreaterThan(0);
    expect(LEGAL_VERSIONS.marketing).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
