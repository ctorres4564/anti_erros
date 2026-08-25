import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { claimPendingAnalysisForUser } from '@/services/pending-analysis';
import { claimPendingSchema } from '@/lib/ai/analysis-schema';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Sessão expirada ou não autenticado.' },
        { status: 401 }
      );
    }

    const isComplete = await isOnboardingComplete(user.id);
    if (!isComplete) {
      return NextResponse.json(
        { error: 'Complete o onboarding antes de resgatar sua análise.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let claimToken = body.claimToken;

    if (!claimToken) {
      claimToken = request.cookies.get('claim_token')?.value;
    }

    const parseResult = claimPendingSchema.safeParse({ claimToken });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Token de resgate ausente ou inválido.' },
        { status: 400 }
      );
    }

    const result = await claimPendingAnalysisForUser({
      userId: user.id,
      claimToken: parseResult.data.claimToken,
    });

    if (result.kind === 'NOT_FOUND') {
      return NextResponse.json({ error: result.message }, { status: 404 });
    }

    if (result.kind === 'ALREADY_CLAIMED') {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }

    if (result.kind === 'EXPIRED') {
      return NextResponse.json({ error: result.message }, { status: 410 });
    }

    if (result.kind === 'LIMIT_REACHED') {
      return NextResponse.json(
        { error: `Você atingiu seu limite diário de ${result.limit} análises.` },
        { status: 429 }
      );
    }

    if (result.kind === 'ERROR') {
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      analysis: result.analysis,
    });

    // Limpar cookie de claim_token após o resgate bem-sucedido
    response.cookies.delete('claim_token');

    return response;
  } catch (error) {
    console.error('Erro inesperado no claim de análise pendente:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno no servidor.' },
      { status: 500 }
    );
  }
}
