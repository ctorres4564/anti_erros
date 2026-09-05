'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Clipboard, Lightbulb, ListChecks, Loader2, RotateCcw } from 'lucide-react';
import { DISCIPLINES } from '@/config/ai';
import {
  confirmAnalysisDiscipline,
  submitAnalysisFeedback,
  trackActivationEvent,
} from '@/lib/analysis-api-client';
import {
  buildActionableRecommendation,
  formatAnalysisDate,
  getCardDecisionLabel,
  getConfidenceLabel,
  getErrorTypeLabel,
  toConservativeLanguage,
} from '@/lib/analysis-presentation';
import type { AnalysisView } from '@/types/analysis';
import { SimpleExplanation } from './SimpleExplanation';

export function FullAnalysisResult({ analysis }: { analysis: AnalysisView }) {
  // Camada de apresentação: não altera nem persiste a recomendação da IA.
  const presentedRecommendation = buildActionableRecommendation({
    recommendedAction: analysis.recommendedAction,
    fallbackAction: 'Refaça esta questão sem consultar a resolução e compare cada etapa com o gabarito.',
    probableErrorType: analysis.probableErrorType,
  });
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const viewedTracked = useRef(false);
  const [confirmedDiscipline, setConfirmedDiscipline] = useState(
    analysis.confirmedDiscipline ?? analysis.discipline ?? 'Outra'
  );
  const [disciplineState, setDisciplineState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    analysis.confirmedDiscipline ? 'saved' : 'idle'
  );
  const [feedbackRating, setFeedbackRating] = useState(analysis.feedback?.rating);
  const [feedbackComment, setFeedbackComment] = useState(analysis.feedback?.comment ?? '');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    analysis.feedback ? 'saved' : 'idle'
  );

  useEffect(() => {
    if (viewedTracked.current) return;
    viewedTracked.current = true;
    trackActivationEvent('full_result_viewed', analysis.id);
  }, [analysis.id]);

  const copyCard = async () => {
    if (!analysis.card) return;
    try {
      await navigator.clipboard.writeText(`Frente: ${analysis.card.front}\n\nVerso: ${analysis.card.back}`);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const saveDiscipline = async () => {
    setDisciplineState('saving');
    try {
      const result = await confirmAnalysisDiscipline(analysis.id, confirmedDiscipline);
      setConfirmedDiscipline(result.confirmedDiscipline);
      setDisciplineState('saved');
    } catch {
      setDisciplineState('error');
    }
  };

  const saveFeedback = async () => {
    if (!feedbackRating) return;
    setFeedbackState('saving');
    try {
      const result = await submitAnalysisFeedback(analysis.id, feedbackRating, feedbackComment);
      setFeedbackComment(result.comment ?? '');
      setFeedbackState('saved');
    } catch {
      setFeedbackState('error');
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
        {analysis.studentReasoning ? (
          <div className="rounded-xl border p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Como você chegou à resposta</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{analysis.studentReasoning}</p>
          </div>
        ) : null}
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

      {/* NEXT ACTION — uma única ação principal, em destaque. O conteúdo vem do
          recommendedAction que o v2.5 já produz; aqui só mudou a apresentação. */}
      <div className="rounded-xl border-2 border-success/30 bg-success/10 p-5 text-foreground">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-success" aria-hidden="true" />
          <h3 className="text-sm font-extrabold uppercase tracking-wide">Próxima ação</h3>
        </div>
        <p className="mt-3 text-lg font-bold leading-snug">
          {toConservativeLanguage(presentedRecommendation.action)}
        </p>
        {presentedRecommendation.followUp ? (
          <p className="mt-2 text-base font-semibold leading-snug">
            {presentedRecommendation.followUp}
          </p>
        ) : null}
      </div>

      <SimpleExplanation
        question={analysis.question}
        correctAnswer={analysis.correctAnswer}
        userAnswer={analysis.userAnswer}
        concept={analysis.coreConcept}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border p-5" aria-labelledby={`discipline-${analysis.id}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Confirmação rápida</p>
          <h3 id={`discipline-${analysis.id}`} className="mt-1 text-lg font-bold">Qual é a disciplina?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            A IA sugeriu <span className="font-semibold text-foreground">{analysis.discipline || 'Outra'}</span>. Sua confirmação não altera a saída original.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <select
              aria-label="Disciplina confirmada"
              value={confirmedDiscipline}
              onChange={(event) => {
                setConfirmedDiscipline(event.target.value);
                setDisciplineState('idle');
              }}
              className="min-h-11 flex-1 rounded-lg border bg-background px-3 text-sm"
            >
              {DISCIPLINES.map((discipline) => <option key={discipline} value={discipline}>{discipline}</option>)}
            </select>
            <button type="button" onClick={saveDiscipline} disabled={disciplineState === 'saving'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
              {disciplineState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Confirmar
            </button>
          </div>
          <p role="status" className={`mt-2 text-xs ${disciplineState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {disciplineState === 'saved' ? 'Disciplina salva.' : disciplineState === 'error' ? 'Não foi possível salvar. Tente novamente.' : ''}
          </p>
        </section>

        <section className="rounded-xl border p-5" aria-labelledby={`feedback-${analysis.id}`}>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Confirmação</p>
          <h3 id={`feedback-${analysis.id}`} className="mt-1 text-lg font-bold">Isso descreve o que aconteceu?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Um clique. Sua resposta não altera a análise acima.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([['YES', 'Sim'], ['PARTIALLY', 'Mais ou menos'], ['NO', 'Não']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={feedbackRating === value}
                onClick={() => { setFeedbackRating(value); setFeedbackState('idle'); }}
                className={`min-h-11 rounded-lg border px-4 text-sm font-semibold ${feedbackRating === value ? 'border-primary bg-primary/10 text-primary' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Campo curto só aparece quando o diagnóstico não bateu — e segue
              opcional: não é necessário para concluir e não reexecuta a análise. */}
          {feedbackRating === 'PARTIALLY' || feedbackRating === 'NO' ? (
            <>
              <label htmlFor={`feedback-comment-${analysis.id}`} className="mt-4 block text-sm font-semibold">
                Quer contar rapidamente o que aconteceu?{' '}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                id={`feedback-comment-${analysis.id}`}
                maxLength={500}
                rows={2}
                value={feedbackComment}
                onChange={(event) => { setFeedbackComment(event.target.value); setFeedbackState('idle'); }}
                className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
            </>
          ) : null}
          <button type="button" onClick={saveFeedback} disabled={!feedbackRating || feedbackState === 'saving'} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {feedbackState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Enviar feedback
          </button>
          <p role="status" className={`mt-2 text-xs ${feedbackState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {feedbackState === 'saved' ? 'Feedback salvo. Obrigado.' : feedbackState === 'error' ? 'Não foi possível salvar. Tente novamente.' : ''}
          </p>
        </section>
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
