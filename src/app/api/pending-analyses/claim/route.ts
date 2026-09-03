import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { claimPendingAnalysisForUser } from '@/services/pending-analysis';
import { claimReferenceInputSchema } from '@/lib/security/claim-reference-schema';
import {
  getClaimCookieName,
  parseClaimReference,
  verifyClaimReference,
} from '@/lib/security/claim-token';

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

    const body = await request.json().catch(() => null);
    const parseResult = claimReferenceInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Referência de resgate ausente ou inválida.' },
        { status: 400 }
      );
    }

    const parsedReference = parseClaimReference(parseResult.data.claimReference);
    const claimToken = parsedReference
      ? request.cookies.get(getClaimCookieName(parsedReference.pendingAnalysisId))?.value
      : undefined;
    const pendingAnalysisId = claimToken
      ? verifyClaimReference(parseResult.data.claimReference, claimToken)
      : null;

    if (!claimToken || !pendingAnalysisId) {
      return NextResponse.json(
        { error: 'Referência de resgate ausente ou inválida.' },
        { status: 400 }
      );
    }

    const result = await claimPendingAnalysisForUser({
      userId: user.id,
      claimToken,
      pendingAnalysisId,
    });

    if (result.kind === 'NOT_FOUND') {
      const response = NextResponse.json({ error: result.message }, { status: 404 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
    }

    if (result.kind === 'ALREADY_CLAIMED') {
      const response = NextResponse.json({ error: result.message }, { status: 409 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
    }

    if (result.kind === 'EXPIRED') {
      const response = NextResponse.json({ error: result.message }, { status: 410 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
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
    response.cookies.delete(getClaimCookieName(pendingAnalysisId));

    return response;
  } catch (error) {
    console.error('Erro inesperado no claim de análise pendente:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno no servidor.' },
      { status: 500 }
    );
  }
}
