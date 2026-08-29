'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LogOut } from 'lucide-react';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const logout = async () => {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout_failed');

      router.replace('/');
      router.refresh();
    } catch {
      setIsPending(false);
      setErrorMessage('Não foi possível sair. Tente novamente.');
    }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        aria-label={isPending ? 'Saindo' : 'Sair'}
        onClick={logout}
        disabled={isPending}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border bg-card px-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 sm:px-3"
      >
        <LogOut className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">{isPending ? 'Saindo…' : 'Sair'}</span>
      </button>
      {errorMessage ? <span className="sr-only" role="alert">{errorMessage}</span> : null}
    </span>
  );
}
