import { z } from 'zod';

/**
 * Validação de Nome Completo.
 * Regras: trim, mínimo 2 caracteres, máximo 120 caracteres.
 * Sem bloqueio a nomes culturais ou raros.
 */
export const fullNameSchema = z
  .string({ required_error: 'Nome é obrigatório.' })
  .trim()
  .min(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  .max(120, { message: 'O nome não pode exceder 120 caracteres.' });

/**
 * Validação do formulário de Login por Magic Link.
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'E-mail é obrigatório.' })
    .trim()
    .email({ message: 'Informe um endereço de e-mail válido.' })
    .toLowerCase(),
});

/**
 * Validação do formulário/endpoint de Onboarding Obrigatório.
 */
export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'É obrigatório aceitar os Termos de Uso para continuar.' }),
  }),
  acknowledgePrivacy: z.literal(true, {
    errorMap: () => ({
      message: 'É obrigatório declarar ciência da Política de Privacidade para continuar.',
    }),
  }),
  marketingConsent: z.boolean().default(false),
});

/**
 * Validação da atualização de perfil.
 */
export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
});

/**
 * Validação da alteração de consentimento de marketing.
 */
export const marketingConsentSchema = z.object({
  consented: z.boolean({ required_error: 'Consentimento de marketing deve ser booleano.' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type MarketingConsentInput = z.infer<typeof marketingConsentSchema>;
