import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SERVICE_ROLE_KEY;

import { createAdminClient } from '@/lib/supabase/admin';
import type { AIAnalysisClient, AIAnalysisResult } from '@/lib/ai/gemini';
import { createAnonymousPendingAnalysis, claimPendingAnalysisForUser } from '@/services/pending-analysis';
import { hashClaimToken } from '@/lib/security/claim-token';

const admin = createAdminClient();

// Spy AI Client para garantir que a inferência só é chamada 1 única vez
let aiCallCount = 0;
const mockAiResult: AIAnalysisResult = {
  output: {
    discipline: 'Direito Administrativo',
    probableErrorType: 'CONCEPT_CONFUSION',
    confidence: 0.88,
    reasoningSummary: 'Você confundiu anulação com revogação.',
    recommendedAction: 'Revise a distinção entre anulação e revogação e resolva microcasos práticos.',
    coreConcept: 'Anulação e Revogação',
    cardAction: 'CREATE_DISCRIMINATION_CARD',
    card: {
      front: 'Qual a diferença essencial entre anulação e revogação?',
      back: 'Anulação decorre de ilegalidade; revogação decorre de conveniência e oportunidade.',
    },
  },
  modelVersion: 'gemini-test-stub',
  usage: {
    inputTokens: 100,
    outputTokens: 50,
    latencyMs: 350,
    retries: 0,
  },
};

const spyAiClient: AIAnalysisClient = {
  async analyze() {
    aiCallCount++;
    return mockAiResult;
  },
};

async function createTestUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste: ${error?.message}`);
  }

  // Fazer login para obter client autenticado
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password: 'password123',
  });
  if (signInError) {
    throw new Error(`Falha ao autenticar usuário de teste: ${signInError.message}`);
  }

  // Concluir onboarding obrigatório
  await userClient.rpc('complete_onboarding', {
    p_full_name: 'Estudante Teste Claim',
    p_exam_target: 'CONCURSO',
    p_terms_version: '2026-02-18',
    p_privacy_version: '2026-02-18',
    p_marketing_opt_in: false,
  });

  return { id: data.user.id, client: userClient };
}

describe('PRD v1.2: Fluxo Integrado de Análise Anônima, Pending Analyses e Claim', () => {
  let testUser: { id: string; client: SupabaseClient };
  const anonId = 'anon_test_' + Date.now();

  beforeAll(async () => {
    testUser = await createTestUser(`claim_test_${Date.now()}@exemplo.com`);
    aiCallCount = 0;
  });

  afterAll(async () => {
    if (testUser?.id) {
      await admin.auth.admin.deleteUser(testUser.id);
    }
  });

  it('1. Executa a primeira análise anônima gerando projeção parcial e pending_analysis completa', async () => {
    const input = {
      question: 'Qual é o ato administrativo que extingue um ato válido por motivo de conveniência?',
      userAnswer: 'Anulação',
      correctAnswer: 'Revogação',
      userAttribution: 'CONFUNDI_CONCEITOS' as const,
      officialExplanation: 'A anulação extingue atos ilegais; a revogação extingue atos válidos e discricionários.',
    };

    const initialAiCalls = aiCallCount;

    const result = await createAnonymousPendingAnalysis({
      input,
      anonymousId: anonId,
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    expect(result.kind).toBe('SUCCESS');
    if (result.kind !== 'SUCCESS') return;

    // Garante que a IA foi chamada exatamente 1 vez
    expect(aiCallCount).toBe(initialAiCalls + 1);

    // Valida retorno da projeção parcial
    expect(result.preview.probableErrorType).toBe('CONCEPT_CONFUSION');
    expect(result.preview.concept).toBe('Anulação e Revogação');
    expect(result.preview.discipline).toBe('Direito Administrativo');
    expect(result.preview.isAligned).toBe(true);
    expect(result.preview.divergenceMessage).toContain('está alinhada');
    expect(result.preview.claimToken).toBeDefined();
    expect(result.preview.claimToken.length).toBe(64); // 32 bytes em hex

    // 2. Inspeciona o banco de dados: pending_analyses contém a inferência completa
    const tokenHash = hashClaimToken(result.preview.claimToken);
    const { data: pendingRow, error: pendingErr } = await admin
      .from('pending_analyses')
      .select('*')
      .eq('claim_token_hash', tokenHash)
      .single();

    expect(pendingErr).toBeNull();
    expect(pendingRow).not.toBeNull();
    expect(pendingRow?.status).toBe('PENDING');
    expect(pendingRow?.recommended_action).toBe(mockAiResult.output.recommendedAction);
    expect(pendingRow?.card_action).toBe('CREATE_DISCRIMINATION_CARD');
    expect(pendingRow?.suggested_flashcard_front).toBe(mockAiResult.output.card?.front);
    expect(pendingRow?.latency_ms).toBe(350);

    // 3. Verifica telemetria anônima registrada
    const { data: events } = await admin
      .from('anonymous_events')
      .select('*')
      .eq('anonymous_id', anonId);

    expect(events?.length).toBeGreaterThanOrEqual(2);
    const eventNames = events?.map((e) => e.event_name);
    expect(eventNames).toContain('partial_analysis_started');
    expect(eventNames).toContain('partial_analysis_completed');
  });

  it('2. Garante que pending_analyses e anonymous_events são inacessíveis diretamente por anon e authenticated (RLS)', async () => {
    // Tentativa com cliente autenticado: acesso negado
    const { data: authData, error: authError } = await testUser.client.from('pending_analyses').select('*');
    expect(authData).toBeNull();
    expect(authError).not.toBeNull();

    const { data: authEvents, error: eventsError } = await testUser.client.from('anonymous_events').select('*');
    expect(authEvents).toBeNull();
    expect(eventsError).not.toBeNull();

    // Tentativa com cliente anon: acesso negado
    const anonClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: anonPending, error: anonError } = await anonClient.from('pending_analyses').select('*');
    expect(anonPending).toBeNull();
    expect(anonError).not.toBeNull();
  });

  it('3. Realiza o Claim com token válido após autenticação SEM segunda chamada à IA', async () => {
    // Cria uma análise anônima para resgatar
    const result = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão para resgate pós-cadastro',
        userAnswer: 'Minha resposta',
        correctAnswer: 'Gabarito oficial',
        userAttribution: 'NAO_SABIA_CONTEUDO',
      },
      anonymousId: 'anon_claim_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    if (result.kind !== 'SUCCESS') throw new Error('Falha no preview anônimo');

    const callsBeforeClaim = aiCallCount;

    // Executa o Claim autenticado
    const claimRes = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: result.preview.claimToken,
    });

    expect(claimRes.kind).toBe('SUCCESS');
    if (claimRes.kind !== 'SUCCESS') return;

    // PROVA CRÍTICA: Nenhuma segunda inferência foi feita durante o claim!
    expect(aiCallCount).toBe(callsBeforeClaim);

    // Valida a análise definitiva criada em analyses
    expect(claimRes.analysis.id).toBeDefined();
    expect(claimRes.analysis.probableErrorType).toBe('CONCEPT_CONFUSION');
    expect(claimRes.analysis.cardAction).toBe('CREATE_DISCRIMINATION_CARD');
    expect(claimRes.analysis.card?.front).toBe(mockAiResult.output.card?.front);

    // Valida que pending_analyses foi atualizada para CLAIMED
    const tokenHash = hashClaimToken(result.preview.claimToken);
    const { data: pendingRow } = await admin
      .from('pending_analyses')
      .select('*')
      .eq('claim_token_hash', tokenHash)
      .single();

    expect(pendingRow?.status).toBe('CLAIMED');
    expect(pendingRow?.claimed_by_user_id).toBe(testUser.id);
    expect(pendingRow?.claimed_at).not.toBeNull();

    // Valida débito na cota diária do usuário
    const { data: quota } = await admin
      .from('daily_quotas')
      .select('*')
      .eq('user_id', testUser.id)
      .single();

    expect(quota?.used_count).toBe(1);
  });

  it('4. Rejeita tentativa de resgate duplicado (uso único do claim token)', async () => {
    const result = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão teste duplo resgate',
        userAnswer: 'X',
        correctAnswer: 'Y',
        userAttribution: 'ERRO_LEITURA',
      },
      anonymousId: 'anon_dup_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    if (result.kind !== 'SUCCESS') throw new Error('Falha no preview anônimo');

    // 1º resgate: sucesso
    const firstClaim = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: result.preview.claimToken,
    });
    expect(firstClaim.kind).toBe('SUCCESS');

    // 2º resgate: rejeitado
    const secondClaim = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: result.preview.claimToken,
    });
    expect(secondClaim.kind).toBe('ALREADY_CLAIMED');
  });

  it('5. Rejeita resgate de análise expirada (> 24 horas)', async () => {
    const result = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão teste expiração',
        userAnswer: 'A',
        correctAnswer: 'B',
        userAttribution: 'ESQUECI_EXCECAO',
      },
      anonymousId: 'anon_exp_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    if (result.kind !== 'SUCCESS') throw new Error('Falha no preview anônimo');

    const tokenHash = hashClaimToken(result.preview.claimToken);

    // Simular expiração retrocedendo expires_at para o passado
    await admin
      .from('pending_analyses')
      .update({ expires_at: new Date(Date.now() - 3600 * 1000).toISOString() })
      .eq('claim_token_hash', tokenHash);

    const expiredClaim = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: result.preview.claimToken,
    });

    expect(expiredClaim.kind).toBe('EXPIRED');
  });

  it('6. Executa a limpeza e purga de análises expiradas via RPC cleanup_expired_pending_analyses', async () => {
    const { data: cleanedCount, error } = await admin.rpc('cleanup_expired_pending_analyses');
    expect(error).toBeNull();
    expect(typeof cleanedCount).toBe('number');
  });
});
