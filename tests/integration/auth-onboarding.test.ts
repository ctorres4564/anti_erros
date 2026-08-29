import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_VERSIONS } from '@/config/legal';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const MAILPIT_URL = 'http://127.0.0.1:54324';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;

import {
  isOnboardingComplete,
  completeUserOnboarding,
  getUserProfileData,
  updateProfileName,
  updateUserMarketingConsent,
} from '@/services/onboarding';

async function checkAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await checkAvailable();

describe.skipIf(!available)('Sprint 2: Integração de Autenticação, Onboarding e Consentimentos LGPD', () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = 'TestPassword123!';
  const emails = {
    userA: `sprint2-user-a-${Date.now()}@test.local`,
    userB: `sprint2-user-b-${Date.now()}@test.local`,
    userC: `sprint2-user-c-${Date.now()}@test.local`,
    magicLinkUser: `sprint2-magic-${Date.now()}@test.local`,
  };

  let uidA = '';
  let uidB = '';
  let uidC = '';
  let uidMagic = '';
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  async function createConfirmedUser(email: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Falha ao criar usuário de teste (${email}): ${error?.message}`);
    }
    return data.user.id;
  }

  async function signIn(email: string): Promise<SupabaseClient> {
    const client = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(`Falha no sign-in (${email}): ${error.message}`);
    }
    return client;
  }

  beforeAll(async () => {
    uidA = await createConfirmedUser(emails.userA);
    uidB = await createConfirmedUser(emails.userB);
    uidC = await createConfirmedUser(emails.userC);

    clientA = await signIn(emails.userA);
    clientB = await signIn(emails.userB);
  });

  afterAll(async () => {
    if (uidA) await admin.auth.admin.deleteUser(uidA);
    if (uidB) await admin.auth.admin.deleteUser(uidB);
    if (uidC) await admin.auth.admin.deleteUser(uidC);
    if (uidMagic) await admin.auth.admin.deleteUser(uidMagic);
  });

  it('1. Usuário recém-criado sem profile deve ter onboarding incompleto', async () => {
    const complete = await isOnboardingComplete(uidA);
    expect(complete).toBe(false);
  });

  it('2. Onboarding válido deve persistir profile com email canônico de auth.users', async () => {
    const result = await completeUserOnboarding({
      userId: uidA,
      email: emails.userA,
      fullName: 'Estudante Aprovado',
      marketingConsent: true,
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-Test-Agent',
    });

    expect(result.success).toBe(true);

    const isComplete = await isOnboardingComplete(uidA);
    expect(isComplete).toBe(true);

    const profile = await getUserProfileData(uidA);
    expect(profile).not.toBeNull();
    expect(profile?.fullName).toBe('Estudante Aprovado');
    expect(profile?.email).toBe(emails.userA.toLowerCase());
    expect(profile?.marketingConsented).toBe(true);
  });

  it('3. Aceites de Termos e Privacidade devem estar registrados com a versão vigente', async () => {
    const { data, error } = await admin
      .from('legal_acceptances')
      .select('*')
      .eq('user_id', uidA)
      .eq('policy_version', LEGAL_VERSIONS.terms)
      .single();

    expect(error).toBeNull();
    expect(data.terms_accepted).toBe(true);
    expect(data.privacy_accepted).toBe(true);
    expect(data.ip_address).toBe('127.0.0.1');
    expect(data.user_agent).toBe('Vitest-Test-Agent');
  });

  it('4. Onboarding com marketingConsent = false deve gravar o estado inicial desativado', async () => {
    const result = await completeUserOnboarding({
      userId: uidB,
      email: emails.userB,
      fullName: 'Estudante B',
      marketingConsent: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-Test-Agent',
    });

    expect(result.success).toBe(true);

    const profile = await getUserProfileData(uidB);
    expect(profile?.marketingConsented).toBe(false);

    const { data: events } = await admin
      .from('marketing_consent_events')
      .select('*')
      .eq('user_id', uidB);

    expect(events?.length).toBe(1);
    expect(events?.[0].consented).toBe(false);
  });

  it('5. Retry ou duplo envio de onboarding deve ser idempotente e não duplicar registros', async () => {
    const retryResult = await completeUserOnboarding({
      userId: uidA,
      email: emails.userA,
      fullName: 'Estudante Aprovado',
      marketingConsent: true,
      ipAddress: '127.0.0.1',
      userAgent: 'Vitest-Test-Agent',
    });

    expect(retryResult.success).toBe(true);

    const { data: acceptances } = await admin
      .from('legal_acceptances')
      .select('id')
      .eq('user_id', uidA)
      .eq('policy_version', LEGAL_VERSIONS.terms);

    expect(acceptances?.length).toBe(1);

    const { data: marketingEvents } = await admin
      .from('marketing_consent_events')
      .select('id')
      .eq('user_id', uidA);

    expect(marketingEvents?.length).toBe(1);
  });

  it('6. Concorrência: duas chamadas simultâneas de onboarding não duplicam aceites', async () => {
    const [res1, res2] = await Promise.all([
      completeUserOnboarding({
        userId: uidC,
        email: emails.userC,
        fullName: 'Estudante Concorrente',
        marketingConsent: false,
      }),
      completeUserOnboarding({
        userId: uidC,
        email: emails.userC,
        fullName: 'Estudante Concorrente',
        marketingConsent: false,
      }),
    ]);

    expect(res1.success).toBe(true);
    expect(res2.success).toBe(true);

    const { data: acceptances } = await admin
      .from('legal_acceptances')
      .select('id')
      .eq('user_id', uidC)
      .eq('policy_version', LEGAL_VERSIONS.terms);

    expect(acceptances?.length).toBe(1);
  });

  it('7. Alteração de consentimento de marketing deve gerar novo evento append-only', async () => {
    const updateRes = await updateUserMarketingConsent({
      userId: uidB,
      consented: true,
      ipAddress: '127.0.0.1',
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.updated).toBe(true);
    expect(updateRes.consented).toBe(true);

    const profile = await getUserProfileData(uidB);
    expect(profile?.marketingConsented).toBe(true);

    const { data: events } = await admin
      .from('marketing_consent_events')
      .select('*')
      .eq('user_id', uidB)
      .order('created_at', { ascending: true });

    expect(events?.length).toBe(2);
    expect(events?.[0].consented).toBe(false);
    expect(events?.[1].consented).toBe(true);
  });

  it('8. Alteração de marketing com valor idêntico ao atual não deve gerar evento duplicado', async () => {
    const updateRes = await updateUserMarketingConsent({
      userId: uidB,
      consented: true,
    });

    expect(updateRes.success).toBe(true);
    expect(updateRes.updated).toBe(false);

    const { data: events } = await admin
      .from('marketing_consent_events')
      .select('id')
      .eq('user_id', uidB);

    expect(events?.length).toBe(2);
  });

  it('9. Alteração de nome deve modificar apenas profiles.full_name e preservar email e id', async () => {
    const updateRes = await updateProfileName(uidA, 'Estudante Nome Novo');
    expect(updateRes.success).toBe(true);

    const { data: profile } = await admin.from('profiles').select('*').eq('id', uidA).single();

    expect(profile.full_name).toBe('Estudante Nome Novo');
    expect(profile.email).toBe(emails.userA.toLowerCase());
    expect(profile.id).toBe(uidA);
  });

  it('10. RLS: Cliente authenticated é estritamente BLOQUEADO de fazer INSERT direto em profiles', async () => {
    const { error } = await clientA.from('profiles').insert({
      id: uidA,
      full_name: 'Hacker Name',
      email: 'hacked@test.local',
    });

    expect(error).not.toBeNull();
  });

  it('11. RLS: Cliente authenticated é estritamente BLOQUEADO de fazer UPDATE direto em profiles', async () => {
    const { error } = await clientA
      .from('profiles')
      .update({ full_name: 'Bypass Direct Update' })
      .eq('id', uidA);

    expect(error).not.toBeNull();
  });

  it('12. RLS: Cliente authenticated é estritamente BLOQUEADO de fazer INSERT direto em legal_acceptances', async () => {
    const { error } = await clientA.from('legal_acceptances').insert({
      user_id: uidA,
      terms_accepted: true,
      privacy_accepted: true,
      policy_version: 'v1.0.0',
    });

    expect(error).not.toBeNull();
  });

  it('13. RLS: Cliente authenticated é estritamente BLOQUEADO de fazer INSERT direto em marketing_consent_events', async () => {
    const { error } = await clientA.from('marketing_consent_events').insert({
      user_id: uidA,
      consented: true,
      policy_version: 'v1.0.0',
    });

    expect(error).not.toBeNull();
  });

  it('14. RLS: Usuário A não consegue ler profile de Usuário B', async () => {
    const { data, error } = await clientA.from('profiles').select('*').eq('id', uidB);

    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it('15. RLS: Usuário A consegue ler seu próprio profile', async () => {
    const { data, error } = await clientA.from('profiles').select('*').eq('id', uidA).single();

    expect(error).toBeNull();
    expect(data.id).toBe(uidA);
    expect(data.full_name).toBe('Estudante Nome Novo');
  });

  it('16. Atomicidade: RPC rejeita parâmetros inválidos sem criar registros parciais', async () => {
    const randomUid = '00000000-0000-0000-0000-000000000099';
    const result = await completeUserOnboarding({
      userId: randomUid,
      email: 'invalid-email',
      fullName: '',
      marketingConsent: false,
    });

    expect(result.success).toBe(false);

    const { data: profile } = await admin.from('profiles').select('*').eq('id', randomUid);
    expect(profile?.length).toBe(0);
  });

  it('17. Fluxo Magic Link ponta a ponta: solicitação via OTP, captura no Mailpit e verificação', async () => {
    const magicClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Solicitar Magic Link
    const { error: otpError } = await magicClient.auth.signInWithOtp({
      email: emails.magicLinkUser,
    });

    expect(otpError).toBeNull();

    // 2. Verificar mensagem gerada no Mailpit local
    const mailRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    expect(mailRes.ok).toBe(true);

    const mailData = await mailRes.json();
    expect(mailData.messages.length).toBeGreaterThan(0);

    const magicEmail = mailData.messages.find((m: { To: Array<{ Address: string }> }) =>
      m.To.some((recipient) => recipient.Address.toLowerCase() === emails.magicLinkUser.toLowerCase())
    );

    expect(magicEmail).toBeDefined();

    // 3. Obter usuário criado no auth
    const { data: usersData } = await admin.auth.admin.listUsers();
    const createdUser = usersData.users.find(
      (u) => u.email?.toLowerCase() === emails.magicLinkUser.toLowerCase()
    );

    expect(createdUser).toBeDefined();
    if (createdUser) {
      uidMagic = createdUser.id;

      // 4. Executar onboarding para esse novo usuário
      const onboardingRes = await completeUserOnboarding({
        userId: uidMagic,
        email: emails.magicLinkUser,
        fullName: 'Estudante Magic Link',
        marketingConsent: true,
        ipAddress: '127.0.0.1',
        userAgent: 'Mailpit-Test-Agent',
      });

      expect(onboardingRes.success).toBe(true);

      // 5. Verificar que o onboarding está completo
      const isComplete = await isOnboardingComplete(uidMagic);
      expect(isComplete).toBe(true);
    }
  });
});
