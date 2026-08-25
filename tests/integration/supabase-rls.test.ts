import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';

/**
 * Testes de integração empírica da Sprint 1 (RLS, RPC privada, cleanup, cascades).
 *
 * Requer um Supabase local (`npx supabase start`) ou um projeto de staging
 * dedicado. Nunca aponte estas variáveis para produção.
 *
 * Rodar com: npm run test:integration
 */

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DATABASE_URL =
  process.env.SUPABASE_TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function checkAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await checkAvailable();

if (!available) {
  console.warn(
    `[integration] Supabase indisponível em ${SUPABASE_URL} — testes de integração pulados. ` +
      'Rode `npx supabase start` (local) ou configure SUPABASE_TEST_URL/SUPABASE_TEST_ANON_KEY/' +
      'SUPABASE_TEST_SERVICE_ROLE_KEY/SUPABASE_TEST_DATABASE_URL para um projeto de staging dedicado.',
  );
}

describe.skipIf(!available)('Sprint 1: validação empírica de RLS, RPC privada e cascades', () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = 'TestPassword123!';
  const emails = {
    a: `homolog-a-${Date.now()}@test.local`,
    b: `homolog-b-${Date.now()}@test.local`,
    admin: `homolog-admin-${Date.now()}@test.local`,
    c: `homolog-c-${Date.now()}@test.local`,
  };

  let uidA = '';
  let uidB = '';
  let uidAdmin = '';
  let uidC = '';
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let clientAdmin: SupabaseClient;

  async function createConfirmedUser(email: string, appMetadata: Record<string, unknown> = {}) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
    });
    if (error || !data.user) throw error ?? new Error('falha ao criar usuário de teste');
    return data.user.id;
  }

  async function signIn(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  async function seedUserData(userId: string) {
    await admin.from('profiles').insert({ id: userId, full_name: 'Homolog', email: `${userId}@test.local` });
    await admin.from('legal_acceptances').insert({ user_id: userId, policy_version: 'v1.0.0' });
    await admin
      .from('marketing_consent_events')
      .insert({ user_id: userId, consented: true, policy_version: 'v1.0.0' });
    await admin.from('daily_quotas').insert({
      user_id: userId,
      quota_date: new Date().toISOString().slice(0, 10),
      daily_limit: 5,
      used_count: 1,
      reserved_count: 0,
    });
    await admin
      .from('idempotency_locks')
      .insert({ user_id: userId, idempotency_key: `key-${userId}`, status: 'PENDING' });
    await admin.from('analyses').insert({
      user_id: userId,
      raw_question: 'Q',
      user_answer: 'A',
      correct_answer: 'C',
      error_type: 'conceptual',
      root_cause_explanation: 'expl',
      learning_gap_concept: 'gap',
      ai_confidence: 0.9,
      model_version: 'v1',
      prompt_version: 'v1',
    });
    await admin.from('events').insert({ user_id: userId, event_name: 'test_event' });
  }

  beforeAll(async () => {
    uidA = await createConfirmedUser(emails.a);
    uidB = await createConfirmedUser(emails.b);
    uidAdmin = await createConfirmedUser(emails.admin, { role: 'admin' });
    uidC = await createConfirmedUser(emails.c);

    await seedUserData(uidA);
    await seedUserData(uidB);
    await seedUserData(uidC);

    clientA = await signIn(emails.a);
    clientB = await signIn(emails.b);
    clientAdmin = await signIn(emails.admin);
  });

  afterAll(async () => {
    for (const id of [uidA, uidB, uidAdmin, uidC]) {
      if (id) await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
  });

  const ownTables = ['profiles', 'legal_acceptances', 'marketing_consent_events', 'daily_quotas', 'analyses'] as const;

  it.each(ownTables)('%s: usuário autenticado lê os próprios dados', async (table) => {
    const { data, error } = await clientA.from(table).select('*');
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it.each(ownTables)('%s: A não lê dados de B', async (table) => {
    const column = table === 'profiles' ? 'id' : 'user_id';
    const { data } = await clientA.from(table).select('*').eq(column, uidB);
    expect(data ?? []).toHaveLength(0);
  });

  it.each(ownTables)('%s: B não lê dados de A', async (table) => {
    const column = table === 'profiles' ? 'id' : 'user_id';
    const { data } = await clientB.from(table).select('*').eq(column, uidA);
    expect(data ?? []).toHaveLength(0);
  });

  it('idempotency_locks: totalmente inacessível ao cliente', async () => {
    const { error, status } = await clientA.from('idempotency_locks').select('*');
    expect(status).toBe(403);
    expect(error).not.toBeNull();
  });

  it('events: usuário comum não lê, admin lê', async () => {
    const { data: dataCommon } = await clientA.from('events').select('*');
    expect(dataCommon ?? []).toHaveLength(0);

    const { data: dataAdmin, error } = await clientAdmin.from('events').select('*');
    expect(error).toBeNull();
    expect((dataAdmin ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('zero escrita direta: INSERT falha em todas as tabelas de negócio', async () => {
    const attempts: Array<[string, Record<string, unknown>]> = [
      ['profiles', { id: uidA, full_name: 'Hack', email: 'x@x.com' }],
      ['legal_acceptances', { user_id: uidA, policy_version: 'v99' }],
      ['marketing_consent_events', { user_id: uidA, consented: true, policy_version: 'v99' }],
      ['daily_quotas', { user_id: uidA, quota_date: '2099-01-01', daily_limit: 999 }],
      ['idempotency_locks', { user_id: uidA, idempotency_key: 'hack', status: 'PENDING' }],
      [
        'analyses',
        {
          user_id: uidA,
          raw_question: 'x',
          user_answer: 'x',
          correct_answer: 'x',
          error_type: 'x',
          root_cause_explanation: 'x',
          learning_gap_concept: 'x',
          ai_confidence: 0.9,
          model_version: 'v1',
          prompt_version: 'v1',
        },
      ],
      ['events', { user_id: uidA, event_name: 'hack' }],
    ];

    for (const [table, payload] of attempts) {
      const { error } = await clientA.from(table).insert(payload);
      expect(error, `INSERT em ${table} deveria falhar`).not.toBeNull();
    }
  });

  it('zero escrita direta: UPDATE falha nas tabelas sensíveis', async () => {
    const { error: e1 } = await clientA.from('profiles').update({ full_name: 'Hacked' }).eq('id', uidA);
    expect(e1).not.toBeNull();
    const { error: e2 } = await clientA.from('daily_quotas').update({ used_count: 0 }).eq('user_id', uidA);
    expect(e2).not.toBeNull();
    const { error: e3 } = await clientA.from('analyses').update({ is_flashcard_worthy: false }).eq('user_id', uidA);
    expect(e3).not.toBeNull();
  });

  it('is_admin(): false para usuário comum, true para admin', async () => {
    const { data: dataA } = await clientA.rpc('is_admin');
    expect(dataA).toBe(false);
    const { data: dataAdmin } = await clientAdmin.rpc('is_admin');
    expect(dataAdmin).toBe(true);
  });

  it('usuário comum não consegue alterar seu próprio app_metadata', async () => {
    const { error } = await clientA.auth.updateUser({ data: { app_metadata: { role: 'admin' } } as never });
    // updateUser só aceita user_metadata; validar diretamente contra o endpoint admin:
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${(await clientA.auth.getSession()).data.session?.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ app_metadata: { role: 'admin' } }),
    });
    expect(res.status).toBe(403);
    expect(error).toBeNull(); // updateUser sem app_metadata não deve nem tentar
  });

  it('private.cleanup_expired_reservations: negado para anon/authenticated, permitido para service_role', async () => {
    const pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
    try {
      for (const role of ['anon', 'authenticated']) {
        await pg.query(`SET ROLE ${role}`);
        await expect(
          pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [
            '00000000-0000-0000-0000-000000000000',
          ]),
        ).rejects.toThrow();
        await pg.query('RESET ROLE');
      }

      await pg.query('SET ROLE service_role');
      await expect(
        pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [uidA]),
      ).resolves.toBeDefined();
      await pg.query('RESET ROLE');
    } finally {
      await pg.end();
    }
  });

  it('cleanup de reservas: os quatro cenários (expirada hoje, repetição, ontem, não expirada)', async () => {
    const pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
    try {
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // Reset de estado conhecido
      await pg.query(
        `UPDATE public.daily_quotas SET reserved_count = 1 WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, today],
      );
      await pg.query(`DELETE FROM public.idempotency_locks WHERE user_id = $1`, [uidA]);
      await pg.query(
        `INSERT INTO public.idempotency_locks (user_id, idempotency_key, quota_date, status, expires_at)
         VALUES ($1, 'it-caso-a', $2::date, 'PENDING', now() - interval '10 seconds')`,
        [uidA, today],
      );

      // CASO A: expirada hoje
      await pg.query('SET ROLE service_role');
      await pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [uidA]);
      await pg.query('RESET ROLE');

      let lock = await pg.query(`SELECT status FROM public.idempotency_locks WHERE user_id = $1 AND idempotency_key = 'it-caso-a'`, [uidA]);
      expect(lock.rows[0].status).toBe('FAILED');
      let quota = await pg.query(
        `SELECT reserved_count FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, today],
      );
      expect(quota.rows[0].reserved_count).toBe(0);

      // CASO B: repetir cleanup, sem estorno duplicado
      await pg.query('SET ROLE service_role');
      await pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [uidA]);
      await pg.query('RESET ROLE');
      quota = await pg.query(
        `SELECT reserved_count FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, today],
      );
      expect(quota.rows[0].reserved_count).toBe(0);

      // CASO C: reserva de ontem isolada de hoje
      await pg.query(
        `UPDATE public.daily_quotas SET reserved_count = 2 WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, today],
      );
      await pg.query(
        `INSERT INTO public.daily_quotas (user_id, quota_date, daily_limit, used_count, reserved_count)
         VALUES ($1, $2::date, 5, 0, 1) ON CONFLICT (user_id, quota_date) DO UPDATE SET reserved_count = 1`,
        [uidA, yesterday],
      );
      await pg.query(
        `INSERT INTO public.idempotency_locks (user_id, idempotency_key, quota_date, status, expires_at)
         VALUES ($1, 'it-caso-c', $2::date, 'PENDING', now() - interval '10 seconds')`,
        [uidA, yesterday],
      );
      await pg.query('SET ROLE service_role');
      await pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [uidA]);
      await pg.query('RESET ROLE');

      const yesterdayQuota = await pg.query(
        `SELECT reserved_count FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, yesterday],
      );
      expect(yesterdayQuota.rows[0].reserved_count).toBe(0);
      const todayQuota = await pg.query(
        `SELECT reserved_count FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date`,
        [uidA, today],
      );
      expect(todayQuota.rows[0].reserved_count).toBe(2);

      // CASO D: reserva não expirada permanece intacta
      await pg.query(`DELETE FROM public.idempotency_locks WHERE user_id = $1`, [uidB]);
      await pg.query(
        `UPDATE public.daily_quotas SET reserved_count = 1 WHERE user_id = $1 AND quota_date = $2::date`,
        [uidB, today],
      );
      await pg.query(
        `INSERT INTO public.idempotency_locks (user_id, idempotency_key, quota_date, status, expires_at)
         VALUES ($1, 'it-caso-d', $2::date, 'PENDING', now() + interval '600 seconds')`,
        [uidB, today],
      );
      await pg.query('SET ROLE service_role');
      await pg.query('SELECT private.cleanup_expired_reservations($1::uuid)', [uidB]);
      await pg.query('RESET ROLE');

      lock = await pg.query(`SELECT status FROM public.idempotency_locks WHERE user_id = $1 AND idempotency_key = 'it-caso-d'`, [uidB]);
      expect(lock.rows[0].status).toBe('PENDING');
      quota = await pg.query(
        `SELECT reserved_count FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date`,
        [uidB, today],
      );
      expect(quota.rows[0].reserved_count).toBe(1);
    } finally {
      await pg.end();
    }
  });

  it('v_current_marketing_consent: cada usuário vê somente o próprio estado atual (security_invoker)', async () => {
    const pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
    try {
      await pg.query(`DELETE FROM public.marketing_consent_events WHERE user_id IN ($1, $2)`, [uidA, uidB]);
      await pg.query(
        `INSERT INTO public.marketing_consent_events (user_id, consented, policy_version, created_at) VALUES
           ($1, true,  'v1.0.0', now() - interval '3 days'),
           ($1, false, 'v1.0.0', now() - interval '1 day'),
           ($2, false, 'v1.0.0', now() - interval '3 days'),
           ($2, true,  'v1.0.0', now() - interval '1 day')`,
        [uidA, uidB],
      );
    } finally {
      await pg.end();
    }

    const { data: viewA } = await clientA.from('v_current_marketing_consent').select('*');
    expect(viewA).toHaveLength(1);
    expect(viewA?.[0].consented).toBe(false);

    const { data: viewB } = await clientB.from('v_current_marketing_consent').select('*');
    expect(viewB).toHaveLength(1);
    expect(viewB?.[0].consented).toBe(true);

    const { data: crossRead } = await clientA.from('v_current_marketing_consent').select('*').eq('user_id', uidB);
    expect(crossRead ?? []).toHaveLength(0);
  });

  it('cascade: excluir auth.users remove registros relacionados em todas as tabelas', async () => {
    const pg = new PgClient({ connectionString: DATABASE_URL });
    const targetId = uidC;
    await pg.connect();
    try {
      const before = await pg.query(
        `SELECT
           (SELECT count(*) FROM public.profiles WHERE id = $1) +
           (SELECT count(*) FROM public.legal_acceptances WHERE user_id = $1) +
           (SELECT count(*) FROM public.marketing_consent_events WHERE user_id = $1) +
           (SELECT count(*) FROM public.daily_quotas WHERE user_id = $1) +
           (SELECT count(*) FROM public.idempotency_locks WHERE user_id = $1) +
           (SELECT count(*) FROM public.analyses WHERE user_id = $1) +
           (SELECT count(*) FROM public.events WHERE user_id = $1) AS total`,
        [targetId],
      );
      expect(Number(before.rows[0].total)).toBeGreaterThan(0);

      const { error } = await admin.auth.admin.deleteUser(targetId);
      expect(error).toBeNull();
      uidC = ''; // já removido; não tentar de novo no afterAll

      const after = await pg.query(
        `SELECT
           (SELECT count(*) FROM public.profiles WHERE id = $1) +
           (SELECT count(*) FROM public.legal_acceptances WHERE user_id = $1) +
           (SELECT count(*) FROM public.marketing_consent_events WHERE user_id = $1) +
           (SELECT count(*) FROM public.daily_quotas WHERE user_id = $1) +
           (SELECT count(*) FROM public.idempotency_locks WHERE user_id = $1) +
           (SELECT count(*) FROM public.analyses WHERE user_id = $1) +
           (SELECT count(*) FROM public.events WHERE user_id = $1) AS total`,
        [targetId],
      );
      expect(Number(after.rows[0].total)).toBe(0);
    } finally {
      await pg.end();
    }
  });
});
