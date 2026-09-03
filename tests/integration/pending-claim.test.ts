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
import type { AnalysisInput } from '@/lib/ai/analysis-schema';
import { createAnonymousPendingAnalysis, claimPendingAnalysisForUser } from '@/services/pending-analysis';
import { hashClaimToken, parseClaimReference } from '@/lib/security/claim-token';

function pendingIdFrom(reference: string): string {
  const parsed = parseClaimReference(reference);
  if (!parsed) throw new Error('Referência de claim inválida no teste.');
  return parsed.pendingAnalysisId;
}

const admin = createAdminClient();
const TEST_USER_PASSWORD = ['password', '123'].join('');

// Spy AI Client para garantir que a inferência só é chamada 1 única vez
let aiCallCount = 0;
let lastAiInput: AnalysisInput | null = null;
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
  async analyze(input) {
    aiCallCount++;
    lastAiInput = input;
    return mockAiResult;
  },
};

async function createTestUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Falha ao criar usuário de teste: ${error?.message}`);
  }

  // Fazer login para obter client autenticado
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password: TEST_USER_PASSWORD,
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
      turnstileToken: 'test-turnstile-valid',
      studentReasoning: 'Pensei que atos válidos também fossem anulados por conveniência.',
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
    expect(lastAiInput).toEqual({
      question: input.question,
      userAnswer: input.userAnswer,
      correctAnswer: input.correctAnswer,
      studentReasoning: input.studentReasoning,
    });
    expect(lastAiInput).not.toHaveProperty('userAttribution');
    expect(lastAiInput).not.toHaveProperty('officialExplanation');

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
    expect(pendingRow?.student_reasoning).toBe(input.studentReasoning);
    expect(pendingRow?.official_explanation).toBeNull();

    // 3. Verifica telemetria anônima registrada
    const { data: events } = await admin
      .from('anonymous_events')
      .select('*')
      .eq('anonymous_id', anonId);

    expect(events?.length).toBeGreaterThanOrEqual(2);
    const eventNames = events?.map((e) => e.event_name);
    expect(eventNames).toContain('analysis_form_started');
    expect(eventNames).toContain('analysis_preview_completed');
    expect(events?.every((event) => JSON.stringify(event.properties) === '{}')).toBe(true);
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
        studentReasoning: 'Usei uma regra que lembrava de outro assunto.',
        userAttribution: 'NAO_SABIA_CONTEUDO',
        turnstileToken: 'test-turnstile-valid',
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
      pendingAnalysisId: pendingIdFrom(result.preview.claimReference),
    });

    expect(claimRes.kind).toBe('SUCCESS');
    if (claimRes.kind !== 'SUCCESS') return;

    // PROVA CRÍTICA: Nenhuma segunda inferência foi feita durante o claim!
    expect(aiCallCount).toBe(callsBeforeClaim);

    // Valida a análise definitiva criada em analyses
    expect(claimRes.analysis.id).toBeDefined();
    expect(claimRes.analysis.probableErrorType).toBe('CONCEPT_CONFUSION');
    expect(claimRes.analysis.discipline).toBe(mockAiResult.output.discipline);
    expect(claimRes.analysis.recommendedAction).toBe(mockAiResult.output.recommendedAction);
    expect(claimRes.analysis.cardAction).toBe('CREATE_DISCRIMINATION_CARD');
    expect(claimRes.analysis.card?.front).toBe(mockAiResult.output.card?.front);
    expect(claimRes.analysis.studentReasoning).toBe('Usei uma regra que lembrava de outro assunto.');

    const { data: claimedAnalysis } = await admin
      .from('analyses')
      .select('student_reasoning')
      .eq('id', claimRes.analysis.id)
      .single();
    expect(claimedAnalysis?.student_reasoning).toBe('Usei uma regra que lembrava de outro assunto.');

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

    const { data: claimedEvent } = await admin
      .from('anonymous_events')
      .select('properties')
      .eq('pending_analysis_id', pendingRow?.id as string)
      .eq('event_name', 'pending_claimed')
      .single();
    expect(claimedEvent?.properties).toEqual({});

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
        turnstileToken: 'test-turnstile-valid',
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
      pendingAnalysisId: pendingIdFrom(result.preview.claimReference),
    });
    expect(firstClaim.kind).toBe('SUCCESS');

    // 2º resgate: rejeitado
    const secondClaim = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: result.preview.claimToken,
      pendingAnalysisId: pendingIdFrom(result.preview.claimReference),
    });
    expect(secondClaim.kind).toBe('ALREADY_CLAIMED');
  });

  it('4b. Não permite usar o token do preview A para reclamar o pending B', async () => {
    const previewA = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão específica do preview A',
        userAnswer: 'A',
        correctAnswer: 'B',
        userAttribution: 'NAO_SEI',
        turnstileToken: 'test-turnstile-valid',
      },
      anonymousId: 'anon_bound_a_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });
    const previewB = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão específica do preview B',
        userAnswer: 'C',
        correctAnswer: 'D',
        userAttribution: 'NAO_SEI',
        turnstileToken: 'test-turnstile-valid',
      },
      anonymousId: 'anon_bound_b_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    if (previewA.kind !== 'SUCCESS' || previewB.kind !== 'SUCCESS') {
      throw new Error('Falha ao preparar previews vinculados');
    }
    const callsBeforeClaim = aiCallCount;

    const crossedClaim = await claimPendingAnalysisForUser({
      userId: testUser.id,
      claimToken: previewA.preview.claimToken,
      pendingAnalysisId: pendingIdFrom(previewB.preview.claimReference),
    });

    expect(crossedClaim.kind).toBe('NOT_FOUND');
    expect(aiCallCount).toBe(callsBeforeClaim);
  });

  it('5. Rejeita resgate de análise expirada (> 24 horas)', async () => {
    const result = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão teste expiração',
        userAnswer: 'A',
        correctAnswer: 'B',
        userAttribution: 'ESQUECI_EXCECAO',
        turnstileToken: 'test-turnstile-valid',
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
      pendingAnalysisId: pendingIdFrom(result.preview.claimReference),
    });

    expect(expiredClaim.kind).toBe('EXPIRED');
  });

  it('6. Executa a limpeza e purga de análises expiradas via RPC cleanup_expired_pending_analyses', async () => {
    const { data: cleanedCount, error } = await admin.rpc('cleanup_expired_pending_analyses');
    expect(error).toBeNull();
    expect(typeof cleanedCount).toBe('number');
  });

  it('7. Claim com cota esgotada (5/5) deve recusar sem alterar pending e permitir resgate posterior com cota livre', async () => {
    // 1. Criar novo usuário de teste com cota cheia (used_count = 5, reserved_count = 0)
    const quotaFullUser = await createTestUser(`claim_quota_full_${Date.now()}@exemplo.com`);
    const today = new Date().toISOString().split('T')[0];
    await admin
      .from('daily_quotas')
      .upsert({
        user_id: quotaFullUser.id,
        quota_date: today,
        daily_limit: 5,
        used_count: 5,
        reserved_count: 0,
      });

    // 2. Criar pending_analysis válida
    const result = await createAnonymousPendingAnalysis({
      input: {
        question: 'Questão teste cota cheia',
        userAnswer: 'Resposta A',
        correctAnswer: 'Resposta B',
        userAttribution: 'NAO_SABIA_CONTEUDO',
        turnstileToken: 'test-turnstile-valid',
      },
      anonymousId: 'anon_quota_full_' + Date.now(),
      clientIp: '127.0.0.1',
      aiClient: spyAiClient,
    });

    expect(result.kind).toBe('SUCCESS');
    if (result.kind !== 'SUCCESS') return;

    const claimToken = result.preview.claimToken;
    const pendingAnalysisId = pendingIdFrom(result.preview.claimReference);
    const tokenHash = hashClaimToken(claimToken);

    // 3. Executar o claim com cota 5/5
    const callsBeforeClaim = aiCallCount;
    const failedClaim = await claimPendingAnalysisForUser({
      userId: quotaFullUser.id,
      claimToken,
      pendingAnalysisId,
    });

    // Validação 1: claim recusado por limite diário
    expect(failedClaim.kind).toBe('LIMIT_REACHED');

    // Validação 2: NÃO criar linha definitiva em analyses
    const { data: analysesRows } = await admin
      .from('analyses')
      .select('*')
      .eq('user_id', quotaFullUser.id);
    expect(analysesRows).toHaveLength(0);

    // Validação 3: used_count continua 5 e reserved_count continua 0
    const { data: quotaAfterFailed } = await admin
      .from('daily_quotas')
      .select('*')
      .eq('user_id', quotaFullUser.id)
      .eq('quota_date', today)
      .single();
    expect(quotaAfterFailed?.used_count).toBe(5);
    expect(quotaAfterFailed?.reserved_count).toBe(0);

    // Validação 4: pending_analysis NÃO vira CLAIMED, status é PENDING e claimed_at é null
    const { data: pendingAfterFailed } = await admin
      .from('pending_analyses')
      .select('*')
      .eq('claim_token_hash', tokenHash)
      .single();
    expect(pendingAfterFailed?.status).toBe('PENDING');
    expect(pendingAfterFailed?.claimed_at).toBeNull();
    expect(pendingAfterFailed?.claimed_by_user_id).toBeNull();

    // 4. Resetar/reduzir cota para liberar 1 vaga (used_count = 4)
    await admin
      .from('daily_quotas')
      .update({ used_count: 4 })
      .eq('user_id', quotaFullUser.id)
      .eq('quota_date', today);

    // 5. Executar NOVAMENTE o claim com o MESMO token
    const successClaim = await claimPendingAnalysisForUser({
      userId: quotaFullUser.id,
      claimToken,
      pendingAnalysisId,
    });

    // Validação 5: claim agora permitido com sucesso
    expect(successClaim.kind).toBe('SUCCESS');
    if (successClaim.kind !== 'SUCCESS') return;

    // Validação 6: exatamente 1 analysis definitiva
    const { data: analysesAfterSuccess } = await admin
      .from('analyses')
      .select('*')
      .eq('user_id', quotaFullUser.id);
    expect(analysesAfterSuccess).toHaveLength(1);
    expect(analysesAfterSuccess?.[0].id).toBe(successClaim.analysis.id);

    // Validação 7: pending marcada CLAIMED
    const { data: pendingAfterSuccess } = await admin
      .from('pending_analyses')
      .select('*')
      .eq('claim_token_hash', tokenHash)
      .single();
    expect(pendingAfterSuccess?.status).toBe('CLAIMED');
    expect(pendingAfterSuccess?.claimed_by_user_id).toBe(quotaFullUser.id);
    expect(pendingAfterSuccess?.claimed_at).not.toBeNull();

    // Validação 8: used_count incrementado exatamente uma vez (4 -> 5)
    const { data: quotaAfterSuccess } = await admin
      .from('daily_quotas')
      .select('*')
      .eq('user_id', quotaFullUser.id)
      .eq('quota_date', today)
      .single();
    expect(quotaAfterSuccess?.used_count).toBe(5);

    // Validação 9: nenhuma segunda chamada ao Gemini durante o claim
    expect(aiCallCount).toBe(callsBeforeClaim);

    // Validação 10: nova tentativa com o mesmo token não cria duplicata (ALREADY_CLAIMED)
    const duplicateClaim = await claimPendingAnalysisForUser({
      userId: quotaFullUser.id,
      claimToken,
      pendingAnalysisId,
    });
    expect(duplicateClaim.kind).toBe('ALREADY_CLAIMED');

    // Cleanup
    await admin.auth.admin.deleteUser(quotaFullUser.id);
  });
});
