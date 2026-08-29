import { afterAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.',
  'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.',
  'EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
].join('');
const APP_URL = process.env.ANALYSIS_TEST_APP_URL ?? 'http://localhost:3000';

async function appIsAvailable() {
  try {
    return (await fetch(APP_URL, { redirect: 'manual' })).status < 500;
  } catch {
    return false;
  }
}

const available = await appIsAvailable();

describe.skipIf(!available)('Magic Link token_hash via HTTP, sem PKCE', () => {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdUsers: string[] = [];

  afterAll(async () => {
    for (const userId of createdUsers) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
  });

  it('cria sessão em cliente sem verifier, limpa a URL e torna o link one-use', async () => {
    const email = `auth-confirm-http-${Date.now()}@test.local`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (createError || !created.user) throw createError ?? new Error('falha ao criar usuário');
    createdUsers.push(created.user.id);

    const { error: onboardingError } = await admin.rpc('complete_onboarding', {
      p_user_id: created.user.id,
      p_full_name: 'Piloto Cross Device',
      p_email: email,
      p_policy_version: 'v1.0.0',
      p_marketing_consented: false,
    });
    if (onboardingError) throw onboardingError;

    const otherEmail = `auth-confirm-other-${Date.now()}@test.local`;
    const { data: other, error: otherError } = await admin.auth.admin.createUser({
      email: otherEmail,
      email_confirm: true,
    });
    if (otherError || !other.user) throw otherError ?? new Error('falha ao criar segundo usuário');
    createdUsers.push(other.user.id);

    const analysisRows = [
      {
        user_id: created.user.id,
        raw_question: 'QUESTAO_VISIVEL_APENAS_DO_USUARIO_AUTENTICADO',
        user_answer: 'A',
        correct_answer: 'B',
        error_type: 'KNOWLEDGE_GAP',
        root_cause_explanation: 'Explicação de teste.',
        learning_gap_concept: 'Conceito de teste',
        ai_confidence: 0.9,
        model_version: 'stub-sem-modelo',
        prompt_version: 'test',
        discipline: 'Atualidades',
        recommended_action: 'Revise o conceito.',
        card_action: 'NO_CARD',
      },
      {
        user_id: other.user.id,
        raw_question: 'QUESTAO_PRIVADA_DE_OUTRO_USUARIO',
        user_answer: 'A',
        correct_answer: 'B',
        error_type: 'KNOWLEDGE_GAP',
        root_cause_explanation: 'Explicação de teste.',
        learning_gap_concept: 'Conceito de teste',
        ai_confidence: 0.9,
        model_version: 'stub-sem-modelo',
        prompt_version: 'test',
        discipline: 'Atualidades',
        recommended_action: 'Revise o conceito.',
        card_action: 'NO_CARD',
      },
    ];
    const { error: analysesError } = await admin.from('analyses').insert(analysisRows);
    if (analysesError) throw analysesError;

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkError) throw linkError;

    const tokenHash = new URL(link.properties.action_link).searchParams.get('token');
    if (!tokenHash) throw new Error('token_hash ausente');

    // Requisição HTTP nova: nenhum storage, cookie ou code verifier é compartilhado.
    const response = await fetch(
      `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent('https://evil.example/steal')}`,
      { redirect: 'manual' }
    );
    const location = response.headers.get('location') ?? '';
    const destination = new URL(location);

    expect(response.status).toBe(307);
    expect(destination.pathname).toBe('/app');
    expect(destination.port).toBe(new URL(APP_URL).port);
    expect(destination.hostname).not.toBe('evil.example');
    expect(location).not.toMatch(/token|code|access|refresh|claim/i);
    const authCookie = (response.headers.get('set-cookie') ?? '').split(';', 1)[0];
    expect(authCookie).toContain('sb-');

    const authenticatedPage = await fetch(`${APP_URL}/app`, {
      headers: { Cookie: authCookie },
    });
    const authenticatedHtml = await authenticatedPage.text();
    expect(authenticatedPage.status).toBe(200);
    expect(authenticatedHtml).toContain('Minha conta');
    expect(authenticatedHtml).toContain('Minhas análises');
    expect(authenticatedHtml).toContain('Sair');
    expect(authenticatedHtml).toContain('QUESTAO_VISIVEL_APENAS_DO_USUARIO_AUTENTICADO');
    expect(authenticatedHtml).not.toContain('QUESTAO_PRIVADA_DE_OUTRO_USUARIO');

    const logout = await fetch(`${APP_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: authCookie },
    });
    expect(logout.status).toBe(200);
    expect(await logout.json()).toEqual({ success: true });

    const protectedAfterLogout = await fetch(`${APP_URL}/app`);
    const loggedOutHtml = await protectedAfterLogout.text();
    expect(protectedAfterLogout.status).toBe(200);
    // Next.js 16 pode serializar redirect() no stream RSC com HTTP 200.
    expect(loggedOutHtml).toContain('NEXT_REDIRECT');
    expect(loggedOutHtml).toContain('/login');
    expect(loggedOutHtml).not.toContain('QUESTAO_VISIVEL_APENAS_DO_USUARIO_AUTENTICADO');

    const replay = await fetch(
      `${APP_URL}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=email`,
      { redirect: 'manual' }
    );

    expect(replay.status).toBe(307);
    const replayDestination = new URL(replay.headers.get('location') ?? APP_URL);
    expect(replayDestination.pathname).toBe('/login');
    expect(replayDestination.search).toBe('?auth_error=link_invalid');
  });
});
