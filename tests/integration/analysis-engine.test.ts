import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Client as PgClient } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DATABASE_URL = process.env.SUPABASE_TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;

import { runAnalysisEngine } from '@/services/analysis';
import { AIAnalysisError, type AIAnalysisClient, type AIAnalysisResult } from '@/lib/ai/gemini';
import type { AnalysisInput, AnalysisOutput } from '@/lib/ai/analysis-schema';

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
    `[integration] Supabase indisponível em ${SUPABASE_URL} — testes do motor de análise pulados. Rode \`npx supabase start\`.`
  );
}

const sampleInput: AnalysisInput = {
  question: 'Qual é a capital da França?',
  userAnswer: 'Lyon',
  correctAnswer: 'Paris',
  studentReasoning: 'Associei a capital à maior cidade francesa que recordei.',
};

const successOutput: AnalysisOutput = {
  discipline: 'Atualidades',
  probableErrorType: 'KNOWLEDGE_GAP',
  confidence: 0.9,
  reasoningSummary: 'Você não conhecia a capital correta da França.',
  recommendedAction: 'Revise o quadro de capitais dos países membros da União Europeia.',
  coreConcept: 'Capitais europeias',
  cardAction: 'CREATE_BASIC_CARD',
  card: { front: 'Qual é a capital da França?', back: 'Paris.' },
};

function makeSuccessAIClient(output: AnalysisOutput = successOutput) {
  const analyze = vi.fn(
    async (): Promise<AIAnalysisResult> => ({
      output,
      modelVersion: 'gemini-mock',
      usage: { inputTokens: 100, outputTokens: 50, latencyMs: 5, retries: 0 },
    })
  );
  return { analyze } satisfies AIAnalysisClient;
}

function makeFailingAIClient(code: 'TIMEOUT' | 'HTTP_ERROR' | 'SCHEMA_INVALID' = 'HTTP_ERROR') {
  const analyze = vi.fn(async (): Promise<AIAnalysisResult> => {
    throw new AIAnalysisError(code, `Falha simulada: ${code}`);
  });
  return { analyze } satisfies AIAnalysisClient;
}

function uuid(): string {
  return crypto.randomUUID();
}

describe.skipIf(!available)('Sprint 3: Motor de Análise — cota, idempotência, cleanup e falhas', () => {
  const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let pg: PgClient;

  const password = 'TestPassword123!';
  const createdUserIds: string[] = [];

  async function createUser(label: string): Promise<string> {
    const email = `sprint3-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error('falha ao criar usuário de teste');
    createdUserIds.push(data.user.id);
    return data.user.id;
  }

  async function getQuota(userId: string, date = new Date().toISOString().slice(0, 10)) {
    const res = await pg.query(
      'SELECT used_count, reserved_count, daily_limit FROM public.daily_quotas WHERE user_id = $1 AND quota_date = $2::date',
      [userId, date]
    );
    return res.rows[0] as { used_count: number; reserved_count: number; daily_limit: number } | undefined;
  }

  async function seedQuota(userId: string, usedCount: number, reservedCount: number, date = new Date().toISOString().slice(0, 10)) {
    await pg.query(
      `INSERT INTO public.daily_quotas (user_id, quota_date, used_count, reserved_count)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (user_id, quota_date) DO UPDATE SET used_count = $3, reserved_count = $4`,
      [userId, date, usedCount, reservedCount]
    );
  }

  beforeAll(async () => {
    pg = new PgClient({ connectionString: DATABASE_URL });
    await pg.connect();
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await pg.end();
  });

  describe('Fase 1 — reserva de cota (casos 1-4)', () => {
    it('Caso 1: used=0, reserved=0 → reserva com sucesso', async () => {
      const userId = await createUser('quota-caso1');
      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeSuccessAIClient(),
      });
      expect(result.kind).toBe('SUCCESS');
      const quota = await getQuota(userId);
      expect(quota?.used_count).toBe(1);
      expect(quota?.reserved_count).toBe(0);
    });

    it('Caso 2: used=4, reserved=0 → reserva a 5ª com sucesso', async () => {
      const userId = await createUser('quota-caso2');
      await seedQuota(userId, 4, 0);
      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeSuccessAIClient(),
      });
      expect(result.kind).toBe('SUCCESS');
      const quota = await getQuota(userId);
      expect(quota?.used_count).toBe(5);
    });

    it('Caso 3: used=5, reserved=0 → bloqueado (limite diário)', async () => {
      const userId = await createUser('quota-caso3');
      await seedQuota(userId, 5, 0);
      const aiClient = makeSuccessAIClient();
      const result = await runAnalysisEngine({ userId, idempotencyKey: uuid(), input: sampleInput, aiClient });
      expect(result.kind).toBe('LIMIT_REACHED');
      if (result.kind === 'LIMIT_REACHED') expect(result.limit).toBe(5);
      expect(aiClient.analyze).not.toHaveBeenCalled();
    });

    it('Caso 4: used=4, reserved=1 → nova reserva bloqueada', async () => {
      const userId = await createUser('quota-caso4');
      await seedQuota(userId, 4, 1);
      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeSuccessAIClient(),
      });
      expect(result.kind).toBe('LIMIT_REACHED');
    });
  });

  describe('Fase 2 — sucesso e falha', () => {
    it('AI success: reserved volta, used +1, lock COMPLETED, 1 análise persistida', async () => {
      const userId = await createUser('ai-success');
      const key = uuid();
      const result = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient: makeSuccessAIClient() });

      expect(result.kind).toBe('SUCCESS');
      const quota = await getQuota(userId);
      expect(quota?.reserved_count).toBe(0);
      expect(quota?.used_count).toBe(1);

      const lock = await pg.query('SELECT status, analysis_id FROM public.idempotency_locks WHERE user_id=$1 AND idempotency_key=$2', [userId, key]);
      expect(lock.rows[0].status).toBe('COMPLETED');
      expect(lock.rows[0].analysis_id).not.toBeNull();

      const analyses = await pg.query('SELECT count(*) FROM public.analyses WHERE user_id=$1', [userId]);
      expect(Number(analyses.rows[0].count)).toBe(1);
      const persisted = await pg.query('SELECT student_reasoning FROM public.analyses WHERE user_id=$1', [userId]);
      expect(persisted.rows[0].student_reasoning).toBe(sampleInput.studentReasoning);
    });

    it('AI failure: reserved volta, used não muda, lock FAILED, 0 análises', async () => {
      const userId = await createUser('ai-failure');
      const key = uuid();
      const result = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient: makeFailingAIClient('HTTP_ERROR') });

      expect(result.kind).toBe('AI_FAILED');
      const quota = await getQuota(userId);
      expect(quota?.reserved_count).toBe(0);
      expect(quota?.used_count).toBe(0);

      const lock = await pg.query('SELECT status FROM public.idempotency_locks WHERE user_id=$1 AND idempotency_key=$2', [userId, key]);
      expect(lock.rows[0].status).toBe('FAILED');

      const analyses = await pg.query('SELECT count(*) FROM public.analyses WHERE user_id=$1', [userId]);
      expect(Number(analyses.rows[0].count)).toBe(0);
    });

    it('AI timeout: lock FAILED, reserva liberada, cota não consumida', async () => {
      const userId = await createUser('ai-timeout');
      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeFailingAIClient('TIMEOUT'),
      });

      expect(result.kind).toBe('AI_FAILED');
      if (result.kind === 'AI_FAILED') expect(result.code).toBe('TIMEOUT');
      const quota = await getQuota(userId);
      expect(quota?.reserved_count).toBe(0);
      expect(quota?.used_count).toBe(0);
    });
  });

  describe('Idempotência', () => {
    it('mesma chave após COMPLETED: não chama IA de novo, não consome cota, retorna resultado persistido', async () => {
      const userId = await createUser('idem-completed');
      const key = uuid();
      const aiClient = makeSuccessAIClient();

      const first = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient });
      expect(first.kind).toBe('SUCCESS');
      if (first.kind !== 'SUCCESS') throw new Error('unreachable');
      expect(first.replayed).toBe(false);

      const second = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient });
      expect(second.kind).toBe('SUCCESS');
      if (second.kind !== 'SUCCESS') throw new Error('unreachable');
      expect(second.replayed).toBe(true);
      expect(second.analysis.id).toBe(first.analysis.id);

      expect(aiClient.analyze).toHaveBeenCalledTimes(1);
      const quota = await getQuota(userId);
      expect(quota?.used_count).toBe(1);
    });

    it('concorrência: 2 requisições simultâneas com a mesma chave → apenas 1 execução efetiva de IA', async () => {
      const userId = await createUser('idem-concurrent');
      const key = uuid();
      const aiClient = makeSuccessAIClient();

      const [a, b] = await Promise.all([
        runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient }),
        runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient }),
      ]);

      const kinds = [a.kind, b.kind].sort();
      // Nunca duas análises: uma reserva e conclui, a outra encontra PENDING (locking real no banco)
      expect(kinds).toEqual(['PENDING', 'SUCCESS']);
      expect(aiClient.analyze).toHaveBeenCalledTimes(1);

      const analyses = await pg.query('SELECT count(*) FROM public.analyses WHERE user_id=$1', [userId]);
      expect(Number(analyses.rows[0].count)).toBe(1);
    });

    it('chaves diferentes, mesmo usuário: cada análise é independente e consome 1 unidade de cota', async () => {
      const userId = await createUser('idem-diff-keys');
      const aiClient = makeSuccessAIClient();

      await runAnalysisEngine({ userId, idempotencyKey: uuid(), input: sampleInput, aiClient });
      await runAnalysisEngine({ userId, idempotencyKey: uuid(), input: sampleInput, aiClient });

      expect(aiClient.analyze).toHaveBeenCalledTimes(2);
      const quota = await getQuota(userId);
      expect(quota?.used_count).toBe(2);
    });

    it('mesma UUID de chave usada por dois usuários diferentes: nenhuma colisão, A nunca recebe análise de B', async () => {
      const userA = await createUser('idem-cross-a');
      const userB = await createUser('idem-cross-b');
      const sharedKey = uuid();

      const resultA = await runAnalysisEngine({
        userId: userA,
        idempotencyKey: sharedKey,
        input: sampleInput,
        aiClient: makeSuccessAIClient({ ...successOutput, coreConcept: 'Concept-A' }),
      });
      const resultB = await runAnalysisEngine({
        userId: userB,
        idempotencyKey: sharedKey,
        input: sampleInput,
        aiClient: makeSuccessAIClient({ ...successOutput, coreConcept: 'Concept-B' }),
      });

      expect(resultA.kind).toBe('SUCCESS');
      expect(resultB.kind).toBe('SUCCESS');
      if (resultA.kind === 'SUCCESS' && resultB.kind === 'SUCCESS') {
        expect(resultA.analysis.id).not.toBe(resultB.analysis.id);
        expect(resultA.analysis.coreConcept).toBe('Concept-A');
        expect(resultB.analysis.coreConcept).toBe('Concept-B');
      }
    });
  });

  describe('Virada de dia e locks expirados', () => {
    it('quota_date isola reserva de ontem da cota de hoje', async () => {
      const userId = await createUser('day-rollover');
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      await seedQuota(userId, 3, 0, yesterday);
      await seedQuota(userId, 1, 0);

      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeSuccessAIClient(),
      });

      expect(result.kind).toBe('SUCCESS');
      const today = await getQuota(userId);
      const past = await getQuota(userId, yesterday);
      expect(today?.used_count).toBe(2);
      expect(past?.used_count).toBe(3); // inalterado
    });

    it('lock PENDING expirado é liberado exatamente uma vez pelo cleanup', async () => {
      const userId = await createUser('expired-lock');
      const key = uuid();
      await seedQuota(userId, 0, 1);
      await pg.query(
        `INSERT INTO public.idempotency_locks (user_id, idempotency_key, status, expires_at)
         VALUES ($1, $2, 'PENDING', now() - interval '10 seconds')`,
        [userId, key]
      );

      // Primeira análise (com outra chave) dispara o cleanup como efeito colateral da reserva
      const result = await runAnalysisEngine({
        userId,
        idempotencyKey: uuid(),
        input: sampleInput,
        aiClient: makeSuccessAIClient(),
      });
      expect(result.kind).toBe('SUCCESS');

      const expiredLock = await pg.query('SELECT status FROM public.idempotency_locks WHERE user_id=$1 AND idempotency_key=$2', [userId, key]);
      expect(expiredLock.rows[0].status).toBe('FAILED');

      const quota = await getQuota(userId);
      // reserved: começou em 1 (do lock expirado) -> cleanup libera para 0 -> nova reserva +1 -> completa -1 => 0
      expect(quota?.reserved_count).toBe(0);
      expect(quota?.used_count).toBe(1);
    });

    it('retry após FAILED: mesma chave pode ser reutilizada e consome nova reserva', async () => {
      const userId = await createUser('retry-after-failed');
      const key = uuid();

      const failed = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient: makeFailingAIClient() });
      expect(failed.kind).toBe('AI_FAILED');

      const retried = await runAnalysisEngine({ userId, idempotencyKey: key, input: sampleInput, aiClient: makeSuccessAIClient() });
      expect(retried.kind).toBe('SUCCESS');

      const quota = await getQuota(userId);
      expect(quota?.used_count).toBe(1);
      expect(quota?.reserved_count).toBe(0);
    });
  });
});
