import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import { recordActivationEvent } from '@/services/activation';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  if (error || errorDescription) {
    console.error('Erro retornado pelo Supabase Auth no callback:', error, errorDescription);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || 'Falha na validação do link de acesso.')}`, request.url)
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Erro ao trocar código por sessão:', exchangeError.message);
      return NextResponse.redirect(
        new URL('/login?error=Link%20de%20acesso%20expirado%20ou%20inv%C3%A1lido.', request.url)
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error('Erro ao recuperar usuário após troca de código:', userError?.message);
      return NextResponse.redirect(
        new URL('/login?error=Sess%C3%A3o%20n%C3%A3o%20p%C3%B4de%20ser%20estabelecida.', request.url)
      );
    }

    // Verificar se o onboarding está completo
    const isComplete = await isOnboardingComplete(user.id);
    await recordActivationEvent(user.id, 'auth_completed');

    if (isComplete) {
      return NextResponse.redirect(new URL('/app', request.url));
    } else {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return NextResponse.redirect(new URL('/login', request.url));
}
