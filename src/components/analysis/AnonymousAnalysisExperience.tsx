'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ShieldCheck, Target } from 'lucide-react';
import type { AnalysisPreview } from '@/types/analysis';
import { AnalysisForm } from './AnalysisForm';
import { PartialAnalysisResult } from './PartialAnalysisResult';
import { trackActivationEvent } from '@/lib/analysis-api-client';

export function AnonymousAnalysisExperience() {
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handlePreview = (nextPreview: AnalysisPreview) => {
    setPreview(nextPreview);
    trackActivationEvent('auth_gate_shown');
    window.requestAnimationFrame(() => resultRef.current?.focus());
  };

  return (
    <div className="space-y-10 pb-8 sm:space-y-14">
      <section className="grid items-center gap-8 py-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-12">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Método Aprender
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Entenda seu erro. Corrija o próximo passo.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Cole uma questão que você errou e receba uma causa provável, com linguagem cuidadosa e uma orientação prática para estudar melhor.
            </p>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <p className="flex items-start gap-2 rounded-xl border bg-card p-3.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Sua autopercepção não influencia a inferência do modelo.
            </p>
            <p className="flex items-start gap-2 rounded-xl border bg-card p-3.5">
              <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Veja uma prévia antes de criar seu acesso gratuito.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Nova análise</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">Conte o que aconteceu</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Preencha os dados observáveis da questão. Campos marcados com * são obrigatórios.
            </p>
          </div>
          <AnalysisForm mode="anonymous" onPreview={handlePreview} />
        </div>
      </section>

      {preview ? (
        <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 outline-none">
          <PartialAnalysisResult preview={preview} />
        </div>
      ) : null}
    </div>
  );
}
