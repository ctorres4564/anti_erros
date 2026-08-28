import Link from 'next/link';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function AnalysisNotFound() {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center text-center">
      <FileQuestion className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold">Análise não encontrada</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ela pode ter sido removida ou não pertencer à sua conta.
      </p>
      <Link
        href="/app"
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar ao histórico
      </Link>
    </div>
  );
}
