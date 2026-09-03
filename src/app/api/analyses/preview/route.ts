import { NextResponse, type NextRequest } from 'next/server';
import { anonymousAnalysisInputSchema } from '@/lib/ai/analysis-schema';
import { resolveAIClient } from '@/lib/ai/resolve-client';
import { createAnonymousPendingAnalysis } from '@/services/pending-analysis';
import {
  generateAnonymousId,
  getClaimCookieName,
  parseClaimReference,
} from '@/lib/security/claim-token';
import { logClaimEvent } from '@/lib/observability/claim-log';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Corpo da requisição ausente ou JSON inválido.' },
        { status: 400 }
      );
    }

    const parseResult = anonymousAnalysisInputSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Payload inválido.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Identificador pseudônimo de visitante
    let anonymousId = request.cookies.get('anti_erros_anon_id')?.value;
    const isNewAnonymousId = !anonymousId;
    if (!anonymousId) {
      anonymousId = generateAnonymousId();
    }

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;

    const aiClient = resolveAIClient(request);

    const result = await createAnonymousPendingAnalysis({
      input: parseResult.data,
      anonymousId,
      clientIp,
      aiClient,
    });

    if (result.kind === 'TURNSTILE_FAILED') {
      return NextResponse.json({ error: result.message }, { status: 403 });
    }

    if (result.kind === 'RATE_LIMITED') {
      return NextResponse.json({ error: result.message }, { status: 429 });
    }

    if (result.kind === 'AI_FAILED') {
      return NextResponse.json(
        {
          error: 'Falha temporária ao processar a análise pedagógica. Tente novamente.',
          code: result.code,
        },
        { status: 503 }
      );
    }

    const response = NextResponse.json({
      success: true,
      preview: {
        claimReference: result.preview.claimReference,
        probableErrorType: result.preview.probableErrorType,
        concept: result.preview.concept,
        discipline: result.preview.discipline,
        divergenceMessage: result.preview.divergenceMessage,
        isAligned: result.preview.isAligned,
      },
    });

    // Armazenar anonymous_id e claim_token em cookies protegidos
    if (isNewAnonymousId) {
      response.cookies.set('anti_erros_anon_id', anonymousId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60, // 1 ano
        path: '/',
      });
    }

    const parsedReference = parseClaimReference(result.preview.claimReference);
    if (!parsedReference) {
      throw new Error('Referência interna de análise pendente inválida.');
    }

    logClaimEvent('pending_preview_created', {
      pendingAnalysisId: parsedReference.pendingAnalysisId,
    });

    response.cookies.set(getClaimCookieName(parsedReference.pendingAnalysisId), result.preview.claimToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 horas
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Erro inesperado na análise anônima:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno no servidor.' },
      { status: 500 }
    );
  }
}
