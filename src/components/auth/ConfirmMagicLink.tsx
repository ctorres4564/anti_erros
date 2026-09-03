'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { AlertCircle, LogIn } from 'lucide-react';
import { confirmMagicLink } from '@/app/auth/confirm/actions';
import { getLoginErrorMessage } from '@/lib/auth/redirect';

interface ConfirmMagicLinkProps {
  tokenHash: string | null;
  type: string | null;
  next: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
    >
      <LogIn className="w-4 h-4" />
      <span>{pending ? 'Entrando...' : 'Entrar no Anti-Erros'}</span>
    </button>
  );
}

export function ConfirmMagicLink({ tokenHash, type, next }: ConfirmMagicLinkProps) {
  const isValid = Boolean(tokenHash) && tokenHash!.length <= 512 && type === 'email';

  if (!isValid) {
    return (
      <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm text-center space-y-5">
        <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3 text-destructive text-sm text-left">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{getLoginErrorMessage('link_invalid')}</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Solicitar novo link de acesso
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 sm:p-8 bg-card border rounded-xl shadow-sm text-center space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Confirmar acesso</h1>
        <p className="text-sm text-muted-foreground">
          Clique no botão abaixo para concluir a entrada no Anti-Erros.
        </p>
      </div>
      <form action={confirmMagicLink} className="space-y-3">
        <input type="hidden" name="token_hash" value={tokenHash ?? ''} />
        <input type="hidden" name="type" value={type ?? ''} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <SubmitButton />
      </form>
    </div>
  );
}
