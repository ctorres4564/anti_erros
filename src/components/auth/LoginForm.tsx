'use client';

import { useEffect, useState, useTransition, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AUTH_RESEND_COOLDOWN_SECONDS,
  getLoginErrorMessage,
  getResendLabel,
} from '@/lib/auth/redirect';
import { requestMagicLink } from '@/lib/auth/request-magic-link';
import { loginSchema } from '@/lib/validation';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

function LoginFormInner() {
  const searchParams = useSearchParams();
  const authError = searchParams.get('auth_error');
  const initialError = getLoginErrorMessage(authError);
  const isContinuingAnalysis = searchParams.get('continue') === 'analysis';
  const claimReference = isContinuingAnalysis ? searchParams.get('claim_ref') : null;

  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isSuccess, setIsSuccess] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isSuccess || cooldownSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldownSeconds, isSuccess]);

  const sendLink = async () => {
    const validation = loginSchema.safeParse({ email });
    if (!validation.success) {
      setErrorMessage(validation.error.errors[0]?.message || 'E-mail inválido.');
      return;
    }

    try {
      const supabase = createClient();
      const confirmationUrl = new URL('/auth/confirm', window.location.origin);
      confirmationUrl.searchParams.set('flow', 'magic_link');
      if (claimReference) confirmationUrl.searchParams.set('claim_ref', claimReference);
      const { error } = await requestMagicLink(
        supabase.auth,
        validation.data.email,
        confirmationUrl.toString()
      );

      if (error) {
        console.error('Falha ao solicitar Magic Link.', { code: error.code ?? 'otp_request_failed' });
        setErrorMessage('Não foi possível enviar o link de acesso no momento. Tente novamente mais tarde.');
        return;
      }

      setCooldownSeconds(AUTH_RESEND_COOLDOWN_SECONDS);
      setIsSuccess(true);
    } catch {
      console.error('Falha inesperada ao solicitar Magic Link.');
      setErrorMessage('Ocorreu um erro inesperado. Tente novamente.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    startTransition(sendLink);
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Verifique seu e-mail</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Se o endereço informado puder receber acesso, enviamos um link para <strong className="text-foreground">{email}</strong>.
          </p>
          {isContinuingAnalysis ? (
            <p className="text-sm text-muted-foreground">
              O acesso pode ser concluído em outro navegador ou dispositivo. Para resgatar automaticamente esta prévia, use o navegador que a criou.
            </p>
          ) : null}
        </div>
        {errorMessage ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5 text-left text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
        <div className="space-y-3 text-xs text-muted-foreground">
          <p>Não recebeu? Verifique a caixa de spam.</p>
          <button
            type="button"
            disabled={isPending || cooldownSeconds > 0}
            onClick={() => {
              setErrorMessage(null);
              startTransition(sendLink);
            }}
            className="min-h-10 rounded-lg border px-3 font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {getResendLabel(isPending, cooldownSeconds)}
          </button>
          <p>
            E-mail incorreto?{' '}
            <button
              type="button"
              onClick={() => {
                setIsSuccess(false);
                setCooldownSeconds(0);
                setEmail('');
              }}
              className="font-medium text-primary hover:underline"
            >
              Usar outro e-mail
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {isContinuingAnalysis ? 'Ver sua análise completa' : 'Acessar a plataforma'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isContinuingAnalysis
            ? 'Informe seu e-mail. A análise pendente será vinculada à sua conta depois da autenticação.'
            : 'Informe seu e-mail para receber um link de acesso instantâneo sem senha.'}
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
            authError === 'link_invalid' ? 'ENVIAR NOVO LINK' : 'ENVIAR LINK DE ACESSO'
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

export function LoginForm() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center py-6 px-4">
      <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Carregando...</div>}>
        <LoginFormInner />
      </Suspense>
    </div>
  );
}
