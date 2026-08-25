import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete, getUserProfileData } from '@/services/onboarding';
import { User, Settings, CheckCircle } from 'lucide-react';

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const isComplete = await isOnboardingComplete(user.id);
  if (!isComplete) {
    redirect('/onboarding');
  }

  const profile = await getUserProfileData(user.id);

  return (
    <div className="max-w-4xl mx-auto py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Olá, {profile?.fullName || 'Estudante'}.
          </h1>
          <p className="text-sm text-muted-foreground">
            Seu acesso está configurado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/conta"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-card text-sm font-medium hover:bg-accent transition-colors"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span>Minha Conta</span>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="p-6 bg-card border rounded-xl shadow-sm space-y-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Ambiente Pronto</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Sua conta foi autenticada e os consentimentos foram registrados com sucesso.
            </p>
          </div>
        </div>

        <div className="p-6 bg-card border rounded-xl shadow-sm space-y-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Identidade & Conformidade</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              E-mail autenticado: <strong className="text-foreground">{profile?.email}</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
