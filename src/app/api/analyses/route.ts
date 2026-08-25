import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { runAnalysisEngine } from '@/services/analysis';
import { authenticatedAnalysisInputSchema, idempotencyKeySchema } from '@/lib/ai/analysis-schema';
import { resolveAIClient } from '@/lib/ai/resolve-client';

export async function POST(request: NextRequest) {
  try {
    // 1-2. Sessão + user.id
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Sessão expirada ou usuário não autenticado.' }, { status: 401 });
    }

    // 3. Onboarding completo
    const onboardingComplete = await isOnboardingComplete(user.id);
    if (!onboardingComplete) {
      return NextResponse.json({ error: 'Onboarding obrigatório incompleto.' }, { status: 403 });
    }

    // Idempotency-Key (header, formato UUID)
    const idempotencyKeyRaw = request.headers.get('Idempotency-Key');
    const idempotencyKeyResult = idempotencyKeySchema.safeParse(idempotencyKeyRaw);
    if (!idempotencyKeyResult.success) {
      return NextResponse.json(
        { error: 'Header Idempotency-Key ausente ou inválido (deve ser um UUID).' },
        { status: 400 }
      );
    }
    const idempotencyKey = idempotencyKeyResult.data;

    // 4. Validação de input (rejeita payload inesperado)
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
    }

    const inputResult = authenticatedAnalysisInputSchema.safeParse(body);
    if (!inputResult.success) {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: inputResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { question, userAnswer, correctAnswer, officialExplanation, userAttribution } = inputResult.data;

    // 5-11. Reserva de cota, chamada de IA (SEM user_attribution no prompt!), persistência
    const aiClient = resolveAIClient(request);
    const result = await runAnalysisEngine({
      userId: user.id,
      idempotencyKey,
      input: { question, userAnswer, correctAnswer, officialExplanation },
      userAttribution,
      aiClient,
    });

    switch (result.kind) {
      case 'SUCCESS':
        return NextResponse.json({ analysis: result.analysis, replayed: result.replayed }, { status: 200 });

      case 'PENDING':
        return NextResponse.json(
          { error: 'ANALYSIS_IN_PROGRESS', message: 'Já existe uma análise em andamento para esta requisição.' },
          { status: 409 }
        );

      case 'LIMIT_REACHED':
        return NextResponse.json({ error: 'DAILY_LIMIT_REACHED', limit: result.limit }, { status: 429 });

      case 'AI_FAILED': {
        const status = result.code === 'SCHEMA_INVALID' ? 422 : result.code === 'TIMEOUT' ? 503 : 502;
        return NextResponse.json(
          { error: 'ANALYSIS_FAILED', message: 'Erro temporário na análise. Sua cota não foi debitada.' },
          { status }
        );
      }

      default:
        return NextResponse.json({ error: 'Erro inesperado.' }, { status: 500 });
    }
  } catch (error) {
    console.error('Erro inesperado em POST /api/analyses:', error);
    return NextResponse.json({ error: 'Ocorreu um erro interno. Tente novamente mais tarde.' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
