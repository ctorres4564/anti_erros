import { describe, it, expect } from 'vitest';
import {
  fullNameSchema,
  loginSchema,
  onboardingSchema,
  updateProfileSchema,
  marketingConsentSchema,
} from '@/lib/validation';

describe('Sprint 2: Validações de Entrada (Zod Schemas)', () => {
  describe('fullNameSchema', () => {
    it('deve aceitar nomes válidos com 2 ou mais caracteres', () => {
      const validNames = ['Ana', 'João Silva', 'Maria de Souza', 'Carlos Eduardo', 'Li'];
      for (const name of validNames) {
        const res = fullNameSchema.safeParse(name);
        expect(res.success).toBe(true);
        if (res.success) {
          expect(res.data).toBe(name.trim());
        }
      }
    });

    it('deve rejeitar strings vazias ou apenas espaços', () => {
      const invalid = ['', ' ', '   '];
      for (const val of invalid) {
        const res = fullNameSchema.safeParse(val);
        expect(res.success).toBe(false);
      }
    });

    it('deve rejeitar nomes com menos de 2 caracteres', () => {
      const res = fullNameSchema.safeParse('A');
      expect(res.success).toBe(false);
    });

    it('deve rejeitar nomes com mais de 120 caracteres', () => {
      const longName = 'A'.repeat(121);
      const res = fullNameSchema.safeParse(longName);
      expect(res.success).toBe(false);
    });

    it('deve aplicar trim automaticamente', () => {
      const res = fullNameSchema.safeParse('   Lucas Pereira   ');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('Lucas Pereira');
      }
    });
  });

  describe('loginSchema', () => {
    it('deve aceitar e-mails válidos e converter para minúsculas', () => {
      const res = loginSchema.safeParse({ email: '  ESTUDANTE@EXEMPLO.COM  ' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.email).toBe('estudante@exemplo.com');
      }
    });

    it('deve rejeitar e-mails em formato inválido', () => {
      const invalid = ['invalido', 'sem-arroba.com', '@semusuario.com', ''];
      for (const email of invalid) {
        const res = loginSchema.safeParse({ email });
        expect(res.success).toBe(false);
      }
    });
  });

  describe('onboardingSchema', () => {
    it('deve aceitar payload completo e válido', () => {
      const res = onboardingSchema.safeParse({
        fullName: 'Beatriz Costa',
        acceptTerms: true,
        acknowledgePrivacy: true,
        marketingConsent: true,
      });
      expect(res.success).toBe(true);
    });

    it('deve aceitar payload com marketingConsent false', () => {
      const res = onboardingSchema.safeParse({
        fullName: 'Beatriz Costa',
        acceptTerms: true,
        acknowledgePrivacy: true,
        marketingConsent: false,
      });
      expect(res.success).toBe(true);
    });

    it('deve rejeitar se acceptTerms for false ou ausente', () => {
      const res = onboardingSchema.safeParse({
        fullName: 'Beatriz Costa',
        acceptTerms: false,
        acknowledgePrivacy: true,
        marketingConsent: false,
      });
      expect(res.success).toBe(false);
    });

    it('deve rejeitar se acknowledgePrivacy for false ou ausente', () => {
      const res = onboardingSchema.safeParse({
        fullName: 'Beatriz Costa',
        acceptTerms: true,
        acknowledgePrivacy: false,
        marketingConsent: false,
      });
      expect(res.success).toBe(false);
    });

    it('deve rejeitar se nome for inválido', () => {
      const res = onboardingSchema.safeParse({
        fullName: ' ',
        acceptTerms: true,
        acknowledgePrivacy: true,
        marketingConsent: false,
      });
      expect(res.success).toBe(false);
    });
  });

  describe('updateProfileSchema', () => {
    it('deve validar nome para atualização', () => {
      const res = updateProfileSchema.safeParse({ fullName: 'Novo Nome' });
      expect(res.success).toBe(true);
    });

    it('deve rejeitar payload sem fullName ou inválido', () => {
      expect(updateProfileSchema.safeParse({}).success).toBe(false);
      expect(updateProfileSchema.safeParse({ fullName: '' }).success).toBe(false);
    });
  });

  describe('marketingConsentSchema', () => {
    it('deve aceitar booleano true ou false', () => {
      expect(marketingConsentSchema.safeParse({ consented: true }).success).toBe(true);
      expect(marketingConsentSchema.safeParse({ consented: false }).success).toBe(true);
    });

    it('deve rejeitar valores não booleanos', () => {
      expect(marketingConsentSchema.safeParse({ consented: 'sim' }).success).toBe(false);
      expect(marketingConsentSchema.safeParse({}).success).toBe(false);
    });
  });
});
