'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ShieldCheck, Target } from 'lucide-react';
import { StaticProductPreview } from './StaticProductPreview';

export function AnonymousAnalysisExperience() {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const togglePreview = () => {
    setIsPreviewOpen((current) => {
      if (!current) window.requestAnimationFrame(() => previewRef.current?.focus());
      return !current;
    });
  };

  return (
    <div className="space-y-10 pb-8 sm:space-y-14">
      <section className="py-8 lg:py-16">
        <div className="mx-auto max-w-3xl space-y-7 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Método Aprender
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Entenda seu erro. Corrija o próximo passo.
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Descubra a causa provável dos seus erros e receba uma orientação prática sobre o que estudar ou fazer depois.
            </p>
          </div>
          <div className="grid gap-3 text-left text-sm sm:grid-cols-2">
            <p className="flex items-start gap-2 rounded-xl border bg-card p-3.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Sua autopercepção não influencia a inferência do modelo.
            </p>
            <button
              type="button"
              aria-expanded={isPreviewOpen}
              aria-controls="product-preview"
              onClick={togglePreview}
              className="flex min-h-12 items-start gap-2 rounded-xl border bg-card p-3.5 text-left font-semibold transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Veja uma prévia antes de criar seu acesso gratuito.
            </button>
          </div>
        </div>
      </section>

      {isPreviewOpen ? (
        <div ref={previewRef} tabIndex={-1} className="scroll-mt-24 outline-none">
          <StaticProductPreview />
        </div>
      ) : null}
    </div>
  );
}
