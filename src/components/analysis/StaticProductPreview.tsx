import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Lightbulb, ListChecks } from 'lucide-react';
import { DEMO_ANALYSIS } from '@/lib/demo-analysis';

export function StaticProductPreview() {
  return (
    <section
      id="product-preview"
      aria-labelledby="product-preview-title"
      className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7"
    >
      <div className="flex items-start gap-3 border-b pb-5">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Lightbulb className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Exemplo de análise
          </p>
          <h2 id="product-preview-title" className="mt-1 text-2xl font-bold tracking-tight">
            Veja como o Anti-Erros transforma um erro em próximo passo
          </h2>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border p-4 lg:col-span-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Questão de exemplo
          </p>
          <p className="mt-2 text-sm leading-relaxed">{DEMO_ANALYSIS.question}</p>
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 lg:col-span-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Resposta errada de exemplo
          </p>
          <p className="mt-2 text-sm leading-relaxed">{DEMO_ANALYSIS.userAnswer}</p>
        </div>
        <div className="rounded-xl border p-4 lg:col-span-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Resposta correta
          </p>
          <p className="mt-2 text-sm leading-relaxed">{DEMO_ANALYSIS.correctAnswer}</p>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Tipo provável do erro</p>
        <p className="mt-2 text-xl font-bold">{DEMO_ANALYSIS.probableErrorType}</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Causa provável: </span>
          {DEMO_ANALYSIS.probableCause}
        </p>
      </div>

      <div className="rounded-xl border-2 border-success/30 bg-success/10 p-5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-success" aria-hidden="true" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Próxima ação</h3>
        </div>
        <p className="mt-3 text-base font-bold leading-relaxed">{DEMO_ANALYSIS.nextAction}</p>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <h3 className="font-bold">Agora analise uma questão sua</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Crie seu acesso gratuito para usar o diagnóstico completo e guardar seu histórico.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
        >
          Analisar meu próprio erro
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
