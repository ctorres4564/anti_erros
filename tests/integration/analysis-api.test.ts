import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Testes E2E reais de POST /api/analyses: requerem Supabase local ativo E o
 * servidor Next.js rodando (`npm run dev`) em APP_URL. Diferente de
 * analysis-engine.test.ts (que chama o serviço diretamente), aqui a
 * requisição sempre atravessa a rota HTTP real.
 */

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const APP_URL = process.env.ANALYSIS_TEST_APP_URL ?? 'http://localhost:3000';

async function checkSupabaseAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkAppAvailable(): Promise<boolean> {
  try {
    const res = await fetch(APP_URL, { redirect: 'manual' });
    return res.status < 500;
  } catch {
    return false;
  }
}

const [supabaseAvailable, appAvailable] = await Promise.all([checkSupabaseAvailable(), checkAppAvailable()]);
const available = supabaseAvailable && appAvailable;

if (!available) {
  console.warn(
    `[integration] Supabase (${supabaseAvailable}) ou app Next.js em ${APP_URL} (${appAvailable}) indisponível — testes E2E de /api/analyses pulados. Rode \`npx supabase start\` e \`npm run dev\`.`
  );
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Corpo de resposta esperado (sucesso ou erro) de POST /api/analyses — apenas os campos usados nos testes. */
interface AnalysisApiResponseBody {
  error?: string;
  message?: string;
  limit?: number;
  replayed?: boolean;
  analysis?: {
    id: string;
    probableErrorType: string;
    confidence: number;
    cardAction: string;
    card: { front: string; back: string } | null;
  };
}

/** Cliente de sessão real via @supabase/ssr com cookie jar em memória, simulando o navegador. */
function createSessionClient() {
  const jar = new Map<string, string>();
  const client: SupabaseClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    isSingleton: false,
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value);
      },
    },
  });
  return { client, cookieHeader: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') };
}

const validPayload = {
  question: 'Qual é a capital da França?',
  userAnswer: 'Lyon',
  correctAnswer: 'Paris',
};

describe.skipIf(!available)('Sprint 3: E2E real de POST /api/analyses', () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = 'TestPassword123!';
  const createdUserIds: string[] = [];

  async function createOnboardedSession(label: string) {
    const email = `sprint3-api-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('falha ao criar usuário');
    createdUserIds.push(data.user.id);

    const { error: onboardError } = await admin.rpc('complete_onboarding', {
      p_user_id: data.user.id,
      p_full_name: 'Usuário Teste E2E',
      p_email: email,
      p_policy_version: 'v1.0.0',
      p_marketing_consented: false,
    });
    if (onboardError) throw onboardError;

    const { client, cookieHeader } = createSessionClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    return { userId: data.user.id, cookieHeader };
  }

  async function createUnonboardedSession(label: string) {
    const email = `sprint3-api-noob-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('falha ao criar usuário');
    createdUserIds.push(data.user.id);

    const { client, cookieHeader } = createSessionClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    return { userId: data.user.id, cookieHeader };
  }

  async function postAnalysis(
    cookie: string,
    idempotencyKey: string | null,
    body: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<{ status: number; json: AnalysisApiResponseBody | null }> {
    const headers: Record<string, string> = { Cookie: cookie, 'Content-Type': 'application/json', ...extraHeaders };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(`${APP_URL}/api/analyses`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }

  /**
   * A API Gemini viva mostrou instabilidade transitória real durante o
   * desenvolvimento (503 "high demand", timeouts ocasionais em modelos
   * gemini-3.x com "thinking" variável — ver docs/SPRINT_3_MODEL_BENCHMARK.md).
   * Isso é uma característica real do provedor externo, não um defeito do
   * nosso código (que já retorna 502/503/422 corretamente nesses casos).
   * Para os testes de "caminho feliz" que fazem uma chamada real ao Gemini,
   * tolera-se retentar com uma NOVA Idempotency-Key algumas vezes antes de
   * falhar o teste — nunca mascara um erro do nosso endpoint (400/401/403/429
   * nunca são re-tentados).
   */
  async function postAnalysisWithLiveApiRetry(cookie: string, body: unknown, attempts = 4) {
    let last: { status: number; json: AnalysisApiResponseBody | null } = { status: 0, json: null };
    for (let i = 0; i < attempts; i++) {
      last = await postAnalysis(cookie, uuid(), body);
      if (last.status === 200) return last;
      if (![502, 503, 422].includes(last.status)) return last;
    }
    return last;
  }

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  it('sem sessão: 401', async () => {
    const res = await fetch(`${APP_URL}/api/analyses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': uuid() },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(401);
  });

  it('onboarding incompleto: 403', async () => {
    const { cookieHeader } = await createUnonboardedSession('onb');
    const { status } = await postAnalysis(cookieHeader(), uuid(), validPayload);
    expect(status).toBe(403);
  });

  it('payload inválido: 400', async () => {
    const { cookieHeader } = await createOnboardedSession('invalid-payload');
    const { status, json } = await postAnalysis(cookieHeader(), uuid(), { question: '' });
    expect(status).toBe(400);
    expect(json?.error).toBeDefined();
  });

  it('payload com campo proibido (user_id): 400', async () => {
    const { cookieHeader } = await createOnboardedSession('forbidden-field');
    const { status } = await postAnalysis(cookieHeader(), uuid(), { ...validPayload, user_id: 'x' });
    expect(status).toBe(400);
  });

  it('Idempotency-Key ausente: 400', async () => {
    const { cookieHeader } = await createOnboardedSession('missing-key');
    const { status } = await postAnalysis(cookieHeader(), null, validPayload);
    expect(status).toBe(400);
  });

  it('Idempotency-Key inválida (não-UUID): 400', async () => {
    const { cookieHeader } = await createOnboardedSession('invalid-key');
    const { status } = await postAnalysis(cookieHeader(), 'not-a-uuid', validPayload);
    expect(status).toBe(400);
  });

  it('erro da IA (forçado via header de teste): não expõe stack trace, cota não debitada', async () => {
    const { cookieHeader, userId } = await createOnboardedSession('ai-failed');
    const { status, json } = await postAnalysis(cookieHeader(), uuid(), validPayload, { 'x-test-ai-failure': 'timeout' });
    expect(status).toBe(503);
    expect(json?.error).toBe('ANALYSIS_FAILED');
    expect(JSON.stringify(json)).not.toContain('at ');
    expect(JSON.stringify(json).toLowerCase()).not.toContain('stack');

    const { data: quota } = await admin
      .from('daily_quotas')
      .select('used_count, reserved_count')
      .eq('user_id', userId)
      .maybeSingle();
    expect(quota?.used_count ?? 0).toBe(0);
    expect(quota?.reserved_count ?? 0).toBe(0);
  });

  it('análise válida real (Gemini real): 200 com estrutura esperada', async () => {
    const { cookieHeader } = await createOnboardedSession('valid-real');
    const { status, json } = await postAnalysisWithLiveApiRetry(cookieHeader(), validPayload);

    expect(status).toBe(200);
    const analysis = json?.analysis;
    expect(analysis).toBeDefined();
    if (!analysis) throw new Error('unreachable: analysis ausente');
    expect(analysis.id).toBeTypeOf('string');
    expect([
      'KNOWLEDGE_GAP',
      'CONCEPT_CONFUSION',
      'EXCEPTION_MISSED',
      'APPLICATION_ERROR',
      'READING_ERROR',
      'INSUFFICIENT_INFORMATION',
    ]).toContain(analysis.probableErrorType);
    expect(analysis.confidence).toBeGreaterThanOrEqual(0);
    expect(analysis.confidence).toBeLessThanOrEqual(1);
    if (analysis.cardAction === 'NO_CARD') {
      expect(analysis.card).toBeNull();
    } else {
      expect(analysis.card).toBeDefined();
      expect(analysis.card?.front).toBeTypeOf('string');
      expect(analysis.card?.back).toBeTypeOf('string');
    }
  }, 180000);

  it('idempotência real via HTTP: segunda chamada com a mesma chave retorna o resultado persistido (replayed)', async () => {
    const { cookieHeader } = await createOnboardedSession('idem-http');

    // A 1ª chamada pode ser re-tentada com chaves novas em caso de instabilidade
    // transitória da API viva; a chave que efetivamente SUCEDER é reutilizada
    // abaixo para o teste real de idempotência (2ª chamada, mesma chave, sem retry).
    let key = uuid();
    let first = await postAnalysis(cookieHeader(), key, validPayload);
    for (let i = 0; i < 3 && [502, 503, 422].includes(first.status); i++) {
      key = uuid();
      first = await postAnalysis(cookieHeader(), key, validPayload);
    }
    expect(first.status).toBe(200);

    const second = await postAnalysis(cookieHeader(), key, validPayload);
    expect(second.status).toBe(200);
    expect(second.json?.replayed).toBe(true);
    expect(second.json?.analysis?.id).toBe(first.json?.analysis?.id);
  }, 180000);

  it('limite diário real via HTTP: 6ª chamada retorna 429 com o limite', async () => {
    const { cookieHeader, userId } = await createOnboardedSession('daily-limit');
    await admin.from('daily_quotas').insert({ user_id: userId, quota_date: new Date().toISOString().slice(0, 10), used_count: 5, reserved_count: 0 });

    const { status, json } = await postAnalysis(cookieHeader(), uuid(), validPayload);
    expect(status).toBe(429);
    expect(json?.error).toBe('DAILY_LIMIT_REACHED');
    expect(json?.limit).toBe(5);
  });
});
