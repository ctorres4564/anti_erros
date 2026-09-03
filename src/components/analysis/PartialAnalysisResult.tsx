import Link from 'next/link';
import { ArrowRight, BookOpenCheck, Lightbulb, ShieldCheck } from 'lucide-react';
import { getAlignmentMessage, getErrorTypeLabel } from '@/lib/analysis-presentation';
import type { AnalysisPreview } from '@/types/analysis';

export function PartialAnalysisResult({ preview }: { preview: AnalysisPreview }) {
  return (
    <section aria-labelledby="preview-title" className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
          <Lightbulb className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Resultado parcial</p>
          <h2 id="preview-title" className="mt-1 text-2xl font-bold tracking-tight">
            Uma causa provável foi identificada
          </h2>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Causa provável</p>
        <p className="mt-1 text-xl font-bold text-foreground">{getErrorTypeLabel(preview.probableErrorType)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Com base nas informações fornecidas, o erro pode estar relacionado a esse padrão. A classificação é provisória.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" /> Conceito
          </p>
          <p className="mt-2 text-sm font-semibold">{preview.concept}</p>
          <p className="mt-1 text-xs text-muted-foreground">{preview.discipline}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Comparação independente
          </p>
          <p className="mt-2 text-sm leading-relaxed">{getAlignmentMessage(preview.isAligned)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <h3 className="font-bold">Veja a análise completa e a ação recomendada</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Crie seu acesso gratuito por Magic Link. Esta análise já foi processada e será vinculada à sua conta sem uma nova inferência.
        </p>
        <Link
          href={`/login?continue=analysis&claim_ref=${encodeURIComponent(preview.claimReference)}`}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:w-auto"
        >
          Ver análise completa
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
