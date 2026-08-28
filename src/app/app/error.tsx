'use client';

import { AlertCircle, RotateCcw } from 'lucide-react';

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
      <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold">Não foi possível carregar esta área</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Suas análises continuam salvas. Verifique sua conexão e tente novamente.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}
