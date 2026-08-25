import { createAdminClient } from '@/lib/supabase/admin';
import { LEGAL_VERSIONS } from '@/config/legal';

export interface UserProfileData {
  id: string;
  fullName: string;
  email: string;
  createdAt: string;
  marketingConsented: boolean;
}

/**
 * Verifica se o usuário completou todos os requisitos obrigatórios de onboarding:
 * 1. Possui registro em profiles;
 * 2. Possui full_name válido (>= 2 caracteres);
 * 3. Possui aceite da versão vigente dos Termos e registro da versão vigente da Privacidade.
 *
 * Marketing NÃO participa dessa condição.
 */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  if (!userId) return false;

  const admin = createAdminClient();

  // 1. Verificar perfil e nome
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile || !profile.full_name || profile.full_name.trim().length < 2) {
    return false;
  }

  // 2. Verificar aceites legais obrigatórios da versão vigente
  const { data: acceptance, error: legalError } = await admin
    .from('legal_acceptances')
    .select('terms_accepted, privacy_accepted')
    .eq('user_id', userId)
    .eq('policy_version', LEGAL_VERSIONS.terms)
    .maybeSingle();

  if (legalError || !acceptance) {
    return false;
  }

  return acceptance.terms_accepted === true && acceptance.privacy_accepted === true;
}

/**
 * Recupera o perfil e o estado atual de consentimento de marketing do usuário.
 */
export async function getUserProfileData(userId: string): Promise<UserProfileData | null> {
  if (!userId) return null;

  const admin = createAdminClient();

  const [profileRes, marketingRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, email, created_at').eq('id', userId).maybeSingle(),
    admin
      .from('v_current_marketing_consent')
      .select('consented')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);

  if (!profileRes.data) {
    return null;
  }

  return {
    id: profileRes.data.id,
    fullName: profileRes.data.full_name,
    email: profileRes.data.email,
    createdAt: profileRes.data.created_at,
    marketingConsented: marketingRes.data?.consented ?? false,
  };
}

/**
 * Executa o onboarding atômico via RPC segura (service_role).
 */
export async function completeUserOnboarding(params: {
  userId: string;
  email: string;
  fullName: string;
  marketingConsent: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const { error } = await admin.rpc('complete_onboarding', {
    p_user_id: params.userId,
    p_full_name: params.fullName.trim(),
    p_email: params.email.trim().toLowerCase(),
    p_policy_version: LEGAL_VERSIONS.terms,
    p_marketing_consented: params.marketingConsent,
    p_ip_address: params.ipAddress ?? undefined,
    p_user_agent: params.userAgent ?? undefined,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Atualiza o nome do perfil de forma segura.
 * Apenas full_name e updated_at são modificados.
 */
export async function updateProfileName(
  userId: string,
  fullName: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('profiles')
    .update({
      full_name: fullName.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Atualiza a preferência de marketing (Append-only e idempotente).
 * Se o valor informado já for igual ao estado atual, não gera evento redundante.
 */
export async function updateUserMarketingConsent(params: {
  userId: string;
  consented: boolean;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ success: boolean; updated: boolean; consented: boolean; error?: string }> {
  const admin = createAdminClient();

  // Consultar estado atual
  const { data: current, error: checkError } = await admin
    .from('marketing_consent_events')
    .select('consented')
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (checkError) {
    return { success: false, updated: false, consented: params.consented, error: checkError.message };
  }

  // Se já for igual, retorna sucesso idempotente
  if (current && current.consented === params.consented) {
    return { success: true, updated: false, consented: params.consented };
  }

  // Inserir novo evento de consentimento
  const { error: insertError } = await admin.from('marketing_consent_events').insert({
    user_id: params.userId,
    consented: params.consented,
    policy_version: LEGAL_VERSIONS.marketing,
    ip_address: params.ipAddress ?? null,
    user_agent: params.userAgent ?? null,
  });

  if (insertError) {
    return { success: false, updated: false, consented: params.consented, error: insertError.message };
  }

  return { success: true, updated: true, consented: params.consented };
}
