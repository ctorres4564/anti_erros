'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, Loader2, Settings } from 'lucide-react';
import { AnalysisApiError, claimPendingAnalysis } from '@/lib/analysis-api-client';
import type { AnalysisHistoryItem, AnalysisView } from '@/types/analysis';
import { AnalysisForm } from './AnalysisForm';
import { AnalysisHistory } from './AnalysisHistory';
import { FullAnalysisResult } from './FullAnalysisResult';

interface AuthenticatedAnalysisExperienceProps {
  firstName: string;
  claimReference: string | null;
  initialHistory: AnalysisHistoryItem[];
  historyUnavailable?: boolean;
}

type ClaimState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string };

function toHistoryItem(analysis: AnalysisView): AnalysisHistoryItem {
  return {
    id: analysis.id,
    question: analysis.question,
    probableErrorType: analysis.probableErrorType,
    recommendedAction: analysis.recommendedAction ?? null,
    cardAction: analysis.cardAction,
    discipline: analysis.discipline ?? null,
    confirmedDiscipline: analysis.confirmedDiscipline ?? null,
    createdAt: analysis.createdAt,
  };
}

export function claimErrorMessage(error: unknown): string {
  if (!(error instanceof AnalysisApiError)) {
    return 'Não foi possível recuperar sua análise pendente.';
  }

  if (error.kind === 'TOKEN_EXPIRED') return 'O prazo de 24 horas para recuperar esta análise terminou.';
  if (error.kind === 'TOKEN_INVALID') return 'Este link de análise é inválido ou já foi utilizado.';
  if (error.kind === 'AUTH') return 'Sua sessão expirou. Entre novamente para recuperar a análise.';
  if (error.kind === 'ONBOARDING') return 'Conclua seu cadastro para recuperar a análise.';
  if (error.kind === 'LIMIT') return 'Seu limite diário foi atingido. A análise pendente não foi consumida.';
  if (error.kind === 'NETWORK') return error.message;
  return 'A análise continua segura, mas não pôde ser recuperada agora. Tente novamente mais tarde.';
}

export function AuthenticatedAnalysisExperience({
  firstName,
  claimReference,
  initialHistory,
  historyUnavailable = false,
}: AuthenticatedAnalysisExperienceProps) {
  const claimStarted = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const claimStatusRef = useRef<HTMLDivElement>(null);
  const [claimState, setClaimState] = useState<ClaimState>(claimReference ? { status: 'loading' } : { status: 'idle' });
  const [latestAnalysis, setLatestAnalysis] = useState<AnalysisView | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const revealAnalysis = (analysis: AnalysisView) => {
    setLatestAnalysis(analysis);
    setHistory((current) => [toHistoryItem(analysis), ...current.filter((item) => item.id !== analysis.id)]);
    window.requestAnimationFrame(() => resultRef.current?.focus());
  };

  useEffect(() => {
    if (!claimReference || claimStarted.current) return;
    claimStarted.current = true;

    void (async () => {
      setClaimState({ status: 'loading' });
      try {
        const analysis = await claimPendingAnalysis(claimReference);
        revealAnalysis(analysis);
        setClaimState({ status: 'success' });
      } catch (error) {
        setClaimState({ status: 'error', message: claimErrorMessage(error) });
        window.requestAnimationFrame(() => claimStatusRef.current?.focus());
      }
    })();
  }, [claimReference]);

  return (
    <div className="space-y-10 py-4 sm:space-y-12 sm:py-8">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Área do estudante</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Olá, {firstName}.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Analise um erro novo ou retome o que já estudou.</p>
        </div>
        <Link
          href="/conta"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          Minha conta
        </Link>
      </header>

      <div ref={claimStatusRef} tabIndex={-1} className="scroll-mt-24 outline-none">
        {claimState.status === 'loading' ? (
          <div role="status" className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            Recuperando sua análise completa, sem processá-la novamente…
          </div>
        ) : null}
        {claimState.status === 'success' ? (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Análise vinculada à sua conta com sucesso.
          </div>
        ) : null}
        {claimState.status === 'error' ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{claimState.message}</p>
          </div>
        ) : null}
      </div>

      {latestAnalysis ? (
        <div ref={resultRef} tabIndex={-1} className="scroll-mt-24 outline-none">
          <FullAnalysisResult analysis={latestAnalysis} />
        </div>
      ) : null}

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="new-analysis-title">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Nova análise</p>
          <h2 id="new-analysis-title" className="mt-1 text-2xl font-bold tracking-tight">Registre um erro recente</h2>
          <p className="mt-2 text-sm text-muted-foreground">A ação recomendada terá mais destaque que o rótulo causal.</p>
        </div>
        <AnalysisForm mode="authenticated" onAnalysis={revealAnalysis} />
      </section>

      <AnalysisHistory items={history} unavailable={historyUnavailable} />
    </div>
  );
}
