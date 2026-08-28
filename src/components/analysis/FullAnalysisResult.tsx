'use client';

import { useState } from 'react';
import { Check, Clipboard, Lightbulb, ListChecks, RotateCcw } from 'lucide-react';
import {
  formatAnalysisDate,
  getCardDecisionLabel,
  getConfidenceLabel,
  getErrorTypeLabel,
  toConservativeLanguage,
} from '@/lib/analysis-presentation';
import type { AnalysisView } from '@/types/analysis';

export function FullAnalysisResult({ analysis }: { analysis: AnalysisView }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyCard = async () => {
    if (!analysis.card) return;
    try {
      await navigator.clipboard.writeText(`Frente: ${analysis.card.front}\n\nVerso: ${analysis.card.back}`);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section aria-labelledby={`analysis-${analysis.id}`} className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Análise completa</p>
          <h2 id={`analysis-${analysis.id}`} className="mt-1 text-2xl font-bold tracking-tight">
            O que este erro indica
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">{formatAnalysisDate(analysis.createdAt)}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-xl border p-4 lg:col-span-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Questão analisada</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{analysis.question}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sua resposta</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{analysis.userAnswer}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Resposta correta</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{analysis.correctAnswer}</p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Disciplina e conceito</p>
          <p className="mt-2 text-sm font-semibold">{analysis.coreConcept}</p>
          <p className="mt-1 text-xs text-muted-foreground">{analysis.discipline || 'Disciplina não informada'}</p>
        </div>
      </div>

      <div className="rounded-xl bg-primary/5 p-5">
        <div className="flex items-center gap-2 text-primary">
          <Lightbulb className="h-5 w-5" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-wide">Causa provável</p>
        </div>
        <p className="mt-2 text-xl font-bold">{getErrorTypeLabel(analysis.probableErrorType)}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Com base nas informações fornecidas, o erro pode estar relacionado a este padrão. {getConfidenceLabel(analysis.confidence)}.
        </p>
        <p className="mt-3 text-sm leading-relaxed">{toConservativeLanguage(analysis.reasoningSummary)}</p>
      </div>

      <div className="rounded-xl border-2 border-emerald-600/30 bg-emerald-50 p-5 text-emerald-950">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide">O que fazer agora</h3>
        </div>
        <p className="mt-3 text-base font-semibold leading-relaxed">
          {analysis.recommendedAction
            ? toConservativeLanguage(analysis.recommendedAction)
            : 'Revise a questão e compare cada etapa da sua resposta com o gabarito comentado.'}
        </p>
      </div>

      <div className="rounded-xl border p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Flashcard</p>
        <h3 className="mt-1 text-lg font-bold">{getCardDecisionLabel(analysis.cardAction)}</h3>

        {analysis.card ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-muted/60 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Frente</p>
              <p className="mt-1 text-sm font-semibold">{analysis.card.front}</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Verso</p>
              <p className="mt-1 text-sm leading-relaxed">{analysis.card.back}</p>
            </div>
            <button
              type="button"
              onClick={copyCard}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-auto"
            >
              {copyState === 'copied' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
              {copyState === 'copied' ? 'Flashcard copiado' : copyState === 'failed' ? 'Não foi possível copiar' : 'Copiar flashcard'}
            </button>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>Neste caso, criar um flashcard não é a melhor ação. Priorize a orientação prática acima.</p>
          </div>
        )}
      </div>
    </section>
  );
}
