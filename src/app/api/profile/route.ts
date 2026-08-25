import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateProfileSchema } from '@/lib/validation';
import { updateProfileName } from '@/services/onboarding';

export async function PATCH(request: NextRequest) {
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

    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Dados inválidos.',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { fullName } = parseResult.data;

    const result = await updateProfileName(user.id, fullName);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Falha ao atualizar o perfil. Tente novamente.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, fullName });
  } catch (error) {
    console.error('Erro inesperado na atualização do perfil:', error);
    return NextResponse.json(
      { error: 'Ocorreu um erro interno. Tente novamente mais tarde.' },
      { status: 500 }
    );
  }
}
