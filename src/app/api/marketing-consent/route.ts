import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { marketingConsentSchema } from '@/lib/validation';
import { updateUserMarketingConsent } from '@/services/onboarding';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Sessão expirada ou usuário não autenticado.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: 'Corpo da requisição inválido.' },
        { status: 400 }
      );
    }

    const parseResult = marketingConsentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Dados inválidos.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { consented } = parseResult.data;

    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await updateUserMarketingConsent({
      userId: user.id,
      consented,
      ipAddress,
      userAgent,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: 'Falha ao atualizar preferência de marketing.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated: result.updated,
      consented: result.consented,
    });
  } catch (error) {
    console.error('Erro inesperado na atualização de marketing:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }
}
