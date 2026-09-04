'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { requestSimpleExplanation } from '@/lib/analysis-api-client';

export type SimpleExplanationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; explanation: string }
  | { status: 'error' };

export const SIMPLE_EXPLANATION_BUTTON_LABEL = 'Explique de forma simples';
export const SIMPLE_EXPLANATION_LOADING_LABEL = 'Preparando uma explicação simples...';
export const SIMPLE_EXPLANATION_ERROR_MESSAGE =
  'Não foi possível gerar a explicação agora. Tente novamente.';

/** Texto do botão conforme o estado. Pure, para poder ser testado sem DOM. */
export function simpleExplanationButtonLabel(state: SimpleExplanationState): string {
  if (state.status === 'loading') return SIMPLE_EXPLANATION_LOADING_LABEL;
  if (state.status === 'success' || state.status === 'error') return 'Explicar novamente';
  return SIMPLE_EXPLANATION_BUTTON_LABEL;
}

interface SimpleExplanationProps {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  concept?: string;
}

/**
 * Recurso auxiliar: pede uma explicação didática da questão.
 * Não refaz a análise do erro e só chama a API após clique explícito.
 */
export function SimpleExplanation({ question, correctAnswer, userAnswer, concept }: SimpleExplanationProps) {
  const [state, setState] = useState<SimpleExplanationState>({ status: 'idle' });

  const explain = async () => {
    if (state.status === 'loading') return;
    setState({ status: 'loading' });

    try {
      const explanation = await requestSimpleExplanation({
        question,
        correctAnswer,
        userAnswer,
        ...(concept ? { concept } : {}),
      });
      setState({ status: 'success', explanation });
    } catch {
      setState({ status: 'error' });
    }
  };

  return (
    <div className="rounded-xl border p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ainda com dúvida?</p>
      <h3 className="mt-1 text-lg font-bold">Entenda a questão em linguagem simples</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Uma explicação curta e passo a passo do conteúdo. Não altera a análise acima.
      </p>

      <button
        type="button"
        onClick={explain}
        disabled={state.status === 'loading'}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 sm:w-auto"
      >
        {state.status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        )}
        {simpleExplanationButtonLabel(state)}
      </button>

      {state.status === 'loading' ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          {SIMPLE_EXPLANATION_LOADING_LABEL}
        </p>
      ) : null}

      {state.status === 'success' ? (
        <div className="mt-4 rounded-lg bg-muted/60 p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.explanation}</p>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{SIMPLE_EXPLANATION_ERROR_MESSAGE}</p>
        </div>
      ) : null}
    </div>
  );
}
