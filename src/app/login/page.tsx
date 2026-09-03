import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/LoginForm';
import { createClient } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ claim_ref?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(params.claim_ref ? `/app?claim_ref=${encodeURIComponent(params.claim_ref)}` : '/app');
  }

  return <LoginForm />;
}
