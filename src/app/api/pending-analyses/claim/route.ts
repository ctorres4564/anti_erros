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
import { logClaimEvent } from '@/lib/observability/claim-log';

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
      logClaimEvent('pending_claim_failed', {
        stage: 'body_validation',
        errorKind: 'schema_invalid',
      });
      return NextResponse.json(
        { error: 'Referência de resgate ausente ou inválida.' },
        { status: 400 }
      );
    }

    const parsedReference = parseClaimReference(parseResult.data.claimReference);
    logClaimEvent('pending_claim_started', {
      pendingAnalysisId: parsedReference?.pendingAnalysisId ?? null,
    });

    if (!parsedReference) {
      logClaimEvent('pending_claim_failed', {
        stage: 'reference_format',
        errorKind: 'reference_format_invalid',
      });
      return NextResponse.json(
        { error: 'Referência de resgate ausente ou inválida.' },
        { status: 400 }
      );
    }

    const claimToken = request.cookies.get(getClaimCookieName(parsedReference.pendingAnalysisId))?.value;
    const pendingAnalysisId = claimToken
      ? verifyClaimReference(parseResult.data.claimReference, claimToken)
      : null;

    if (!claimToken || !pendingAnalysisId) {
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId: parsedReference.pendingAnalysisId,
        stage: !claimToken ? 'cookie_missing' : 'signature_mismatch',
        errorKind: 'reference_unverified',
      });
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
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId,
        stage: 'claim_service',
        errorKind: 'NOT_FOUND',
      });
      const response = NextResponse.json({ error: result.message }, { status: 404 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
    }

    if (result.kind === 'ALREADY_CLAIMED') {
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId,
        stage: 'claim_service',
        errorKind: 'ALREADY_CLAIMED',
      });
      const response = NextResponse.json({ error: result.message }, { status: 409 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
    }

    if (result.kind === 'EXPIRED') {
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId,
        stage: 'claim_service',
        errorKind: 'EXPIRED',
      });
      const response = NextResponse.json({ error: result.message }, { status: 410 });
      response.cookies.delete(getClaimCookieName(pendingAnalysisId));
      return response;
    }

    if (result.kind === 'LIMIT_REACHED') {
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId,
        stage: 'claim_service',
        errorKind: 'LIMIT_REACHED',
      });
      return NextResponse.json(
        { error: `Você atingiu seu limite diário de ${result.limit} análises.` },
        { status: 429 }
      );
    }

    if (result.kind === 'ERROR') {
      logClaimEvent('pending_claim_failed', {
        pendingAnalysisId,
        stage: 'claim_service',
        errorKind: 'ERROR',
      });
      return NextResponse.json({ error: result.message }, { status: 500 });
    }

    logClaimEvent('pending_claim_succeeded', {
      pendingAnalysisId,
      analysisId: result.analysis.id,
    });

    const response = NextResponse.json({
      success: true,
      analysis: result.analysis,
    });

    // Limpar cookie de claim_token após o resgate bem-sucedido
    response.cookies.delete(getClaimCookieName(pendingAnalysisId));

    return response;
  } catch (error) {
    logClaimEvent('pending_claim_failed', {
      stage: 'unexpected_exception',
      errorKind: 'ERROR',
    });
    console.error('Erro inesperado no claim de análise pendente:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno no servidor.' },
      { status: 500 }
    );
  }
}
