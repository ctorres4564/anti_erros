import { NextResponse, type NextRequest } from 'next/server';
import { getSafePostAuthPath } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';
import { recordActivationEvent } from '@/services/activation';
import { isOnboardingComplete } from '@/services/onboarding';

const INVALID_LINK_PATH = '/login?auth_error=link_invalid';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const destination = getSafePostAuthPath(requestUrl.searchParams.get('next'));

  if (!tokenHash || tokenHash.length > 512 || type !== 'email') {
    return NextResponse.redirect(new URL(INVALID_LINK_PATH, request.url));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });

    if (error || !data.user) {
      console.warn('Falha ao validar Magic Link.', {
        code: error && 'code' in error ? error.code : 'otp_verification_failed',
      });
      return NextResponse.redirect(new URL(INVALID_LINK_PATH, request.url));
    }

    const onboardingComplete = await isOnboardingComplete(data.user.id);
    await recordActivationEvent(data.user.id, 'auth_completed');

    return NextResponse.redirect(
      new URL(onboardingComplete ? destination : '/onboarding', request.url)
    );
  } catch {
    console.warn('Falha inesperada ao validar Magic Link.');
    return NextResponse.redirect(new URL(INVALID_LINK_PATH, request.url));
  }
}
