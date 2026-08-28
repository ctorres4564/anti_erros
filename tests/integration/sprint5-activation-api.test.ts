import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { AIAnalysisClient } from '@/lib/ai/gemini';
import { createAnonymousPendingAnalysis } from '@/services/pending-analysis';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_ROLE_KEY = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
  'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.',
  'EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
].join('');
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;
const APP_URL = process.env.ANALYSIS_TEST_APP_URL ?? 'http://localhost:3000';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;

async function appIsAvailable() {
  try { return (await fetch(APP_URL, { redirect: 'manual' })).status < 500; } catch { return false; }
}

const available = await appIsAvailable();

function sessionClient() {
  const jar = new Map<string, string>();
  const client = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    isSingleton: false,
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  return { client, cookie: () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ') };
}

describe.skipIf(!available)('Sprint 5: APIs de ativação sem modelo', () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdUsers: string[] = [];
  let analysisId = '';
  let ownerCookie = '';
  let otherCookie = '';
  let ownerId = '';

  async function createOnboarded(label: string) {
    const email = `sprint5-${label}-${Date.now()}@test.local`;
    const password = 'TestPassword123!';
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('falha ao criar usuário');
    createdUsers.push(data.user.id);
    const { error: onboardingError } = await admin.rpc('complete_onboarding', {
      p_user_id: data.user.id,
      p_full_name: 'Piloto Sprint 5',
      p_email: email,
      p_policy_version: 'v1.0.0',
      p_marketing_consented: false,
    });
    if (onboardingError) throw onboardingError;
    const session = sessionClient();
    const { error: signInError } = await session.client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { id: data.user.id, cookie: session.cookie() };
  }

  beforeAll(async () => {
    const owner = await createOnboarded('owner');
    const other = await createOnboarded('other');
    ownerId = owner.id;
    ownerCookie = owner.cookie;
    otherCookie = other.cookie;
    const { data, error } = await admin.from('analyses').insert({
      user_id: ownerId,
      raw_question: 'Qual é a capital do Brasil?',
      user_answer: 'Rio de Janeiro',
      correct_answer: 'Brasília',
      error_type: 'KNOWLEDGE_GAP',
      root_cause_explanation: 'A informação factual precisa ser revisada.',
      learning_gap_concept: 'Capital federal',
      ai_confidence: 0.9,
      model_version: 'stub-sem-modelo',
      prompt_version: 'test',
      discipline: 'Atualidades',
    }).select('id').single();
    if (error || !data) throw error ?? new Error('falha ao criar análise');
    analysisId = data.id;
  });

  afterAll(async () => {
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  });

  it('exige autenticação nas mutações', async () => {
    const response = await fetch(`${APP_URL}/api/analyses/${analysisId}/discipline`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ discipline: 'Atualidades' }),
    });
    expect(response.status).toBe(401);
  });

  it('encadeia pending, Magic Link, sessão e claim HTTP sem reinferência', async () => {
    const email = `sprint5-magic-claim-${Date.now()}@test.local`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (createError || !created.user) throw createError ?? new Error('falha ao criar usuário Magic Link');
    createdUsers.push(created.user.id);
    const { error: onboardingError } = await admin.rpc('complete_onboarding', {
      p_user_id: created.user.id,
      p_full_name: 'Piloto Magic Claim',
      p_email: email,
      p_policy_version: 'v1.0.0',
      p_marketing_consented: false,
    });
    if (onboardingError) throw onboardingError;

    let aiCalls = 0;
    const aiClient: AIAnalysisClient = {
      async analyze() {
        aiCalls += 1;
        return {
          output: {
            discipline: 'Atualidades',
            probableErrorType: 'KNOWLEDGE_GAP',
            confidence: 0.86,
            reasoningSummary: 'A informação factual apresentada precisa ser revisada.',
            recommendedAction: 'Revise a capital federal e compare a resposta com o gabarito oficial.',
            coreConcept: 'Capital federal',
            cardAction: 'NO_CARD',
            card: null,
          },
          modelVersion: 'stub-sem-modelo',
          usage: { inputTokens: 0, outputTokens: 0, latencyMs: 1, retries: 0 },
        };
      },
    };

    const pending = await createAnonymousPendingAnalysis({
      input: {
        question: 'Qual é a capital do Brasil?',
        userAnswer: 'Rio de Janeiro',
        correctAnswer: 'Brasília',
        userAttribution: 'NAO_SABIA_CONTEUDO',
        turnstileToken: 'test-turnstile-valid',
      },
      anonymousId: `sprint5_magic_${Date.now()}`,
      clientIp: '127.0.0.1',
      aiClient,
    });
    expect(pending.kind).toBe('SUCCESS');
    if (pending.kind !== 'SUCCESS') return;

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkError) throw linkError;
    const tokenHash = new URL(link.properties.action_link).searchParams.get('token');
    if (!tokenHash) throw new Error('token_hash ausente no Magic Link local');

    const magicSession = sessionClient();
    const { error: verifyError } = await magicSession.client.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
    if (verifyError) throw verifyError;

    const response = await fetch(`${APP_URL}/api/pending-analyses/claim`, {
      method: 'POST',
      headers: { Cookie: `${magicSession.cookie()}; claim_token=${pending.preview.claimToken}` },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).analysis.probableErrorType).toBe('KNOWLEDGE_GAP');
    expect(response.headers.get('set-cookie')?.toLowerCase()).toContain('claim_token=');
    expect(aiCalls).toBe(1);
  });

  it('confirma disciplina do proprietário sem sobrescrever a disciplina da IA', async () => {
    const response = await fetch(`${APP_URL}/api/analyses/${analysisId}/discipline`, {
      method: 'PATCH',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ discipline: 'Português' }),
    });
    expect(response.status).toBe(200);
    const { data } = await admin.from('analyses')
      .select('discipline, discipline_confirmed, discipline_confirmed_at').eq('id', analysisId).single();
    expect(data?.discipline).toBe('Atualidades');
    expect(data?.discipline_confirmed).toBe('Português');
    expect(data?.discipline_confirmed_at).not.toBeNull();
  });

  it('impede outro usuário de confirmar disciplina', async () => {
    const response = await fetch(`${APP_URL}/api/analyses/${analysisId}/discipline`, {
      method: 'PATCH',
      headers: { Cookie: otherCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ discipline: 'Matemática' }),
    });
    expect(response.status).toBe(404);
  });

  it('cria e atualiza um único feedback separado da análise', async () => {
    for (const rating of ['PARTIALLY', 'YES'] as const) {
      const response = await fetch(`${APP_URL}/api/analyses/${analysisId}/feedback`, {
        method: 'PUT',
        headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: 'Orientação útil.' }),
      });
      expect(response.status).toBe(200);
    }
    const { data } = await admin.from('analysis_feedback').select('*').eq('analysis_id', analysisId);
    expect(data).toHaveLength(1);
    expect(data?.[0].rating).toBe('YES');
    expect(data?.[0].user_id).toBe(ownerId);
  });

  it('impede outro usuário de enviar feedback', async () => {
    const response = await fetch(`${APP_URL}/api/analyses/${analysisId}/feedback`, {
      method: 'PUT',
      headers: { Cookie: otherCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: 'NO' }),
    });
    expect(response.status).toBe(404);
  });

  it('registra apenas eventos permitidos e sem conteúdo pedagógico', async () => {
    const accepted = await fetch(`${APP_URL}/api/activation-events`, {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'full_result_viewed', analysisId }),
    });
    expect(accepted.status).toBe(204);
    const rejected = await fetch(`${APP_URL}/api/activation-events`, {
      method: 'POST',
      headers: { Cookie: ownerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'prompt_dumped', analysisId, question: 'segredo' }),
    });
    expect(rejected.status).toBe(400);

    const { data } = await admin.from('events').select('properties').eq('user_id', ownerId).eq('event_name', 'full_result_viewed');
    expect(data?.at(-1)?.properties).toEqual({ analysisId });
  });
});
