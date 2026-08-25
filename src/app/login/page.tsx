'use client';

import { useState, useTransition, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { loginSchema } from '@/lib/validation';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function LoginForm() {
  const searchParams = useSearchParams();
  const initialError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const validation = loginSchema.safeParse({ email });
    if (!validation.success) {
      setErrorMessage(validation.error.errors[0]?.message || 'E-mail inválido.');
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const origin = window.location.origin;
        const { error } = await supabase.auth.signInWithOtp({
          email: validation.data.email,
          options: {
            emailRedirectTo: `${origin}/auth/callback`,
          },
        });

        if (error) {
          console.error('Erro no Supabase Auth signInWithOtp:', error.message);
          // Mensagem genérica para resiliência e proteção contra enumeração
          setErrorMessage('Não foi possível enviar o link de acesso no momento. Tente novamente mais tarde.');
          return;
        }

        setIsSuccess(true);
      } catch (err) {
        console.error('Erro inesperado no login:', err);
        setErrorMessage('Ocorreu um erro inesperado. Tente novamente.');
      }
    });
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm text-center space-y-5">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Verifique seu e-mail</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Se o endereço informado puder receber acesso, enviamos um link para <strong className="text-foreground">{email}</strong>.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Não recebeu? Verifique a caixa de spam ou{' '}
          <button
            type="button"
            onClick={() => {
              setIsSuccess(false);
              setEmail('');
            }}
            className="text-primary hover:underline font-medium"
          >
            tente com outro e-mail
          </button>.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Acessar a Plataforma</h1>
        <p className="text-sm text-muted-foreground">
          Informe seu e-mail para receber um link de acesso instantâneo sem senha.
        </p>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-foreground">
            E-mail
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              placeholder="seu.email@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              required
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
            />
            <Mail className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3.5" />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || !email.trim()}
          className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Enviando link...</span>
            </>
          ) : (
            'ENVIAR LINK DE ACESSO'
          )}
        </button>
      </form>

      <div className="pt-2 text-center">
        <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">
          ← Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center py-6 px-4">
      <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
