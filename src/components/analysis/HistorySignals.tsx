'use client';

import { useEffect, useRef } from 'react';
import { TrendingUp } from 'lucide-react';
import { getErrorTypeLabel } from '@/lib/analysis-presentation';
import { trackActivationEvent } from '@/lib/analysis-api-client';
import type { AnalysisHistoryItem } from '@/types/analysis';

/**
 * "Primeiros sinais" — resumo conservador do histórico já existente.
 * Não é dashboard: só contagem por categoria e uma leitura cautelosa, calibrada
 * pelo tamanho da amostra. Nunca afirma causalidade nem "seu principal problema".
 */

export type SampleMaturity = 'EMPTY' | 'STARTED' | 'FIRST_SIGNALS' | 'EMERGING' | 'ESTABLISHED';

export function getSampleMaturity(total: number): SampleMaturity {
  if (total === 0) return 'EMPTY';
  if (total <= 2) return 'STARTED';
  if (total <= 9) return 'FIRST_SIGNALS';
  if (total <= 19) return 'EMERGING';
  return 'ESTABLISHED';
}

/** Aviso de amostra pequena. Ausente só quando a amostra deixa de ser pequena. */
export function getSampleWarning(total: number): string | null {
  const maturity = getSampleMaturity(total);
  if (maturity === 'EMPTY' || maturity === 'STARTED') return null;
  if (maturity === 'FIRST_SIGNALS') {
    return 'Seu histórico ainda é pequeno. Esses números ainda não representam um padrão confiável.';
  }
  if (maturity === 'EMERGING') {
    return 'A amostra ainda é limitada. Trate isto como indício, não como conclusão.';
  }
  return 'Estes números descrevem o que já foi analisado; não explicam sozinhos a causa.';
}

/** Conta ocorrências por probableErrorType, da mais frequente para a menos. */
export function countByErrorType(items: AnalysisHistoryItem[]): Array<{ errorType: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.probableErrorType, (counts.get(item.probableErrorType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([errorType, count]) => ({ errorType, count }))
    .sort((a, b) => b.count - a.count || a.errorType.localeCompare(b.errorType));
}

/**
 * Frase de leitura. Deliberadamente descritiva: "apareceu mais vezes",
 * nunca "seu principal problema é". Só existe a partir de 3 análises.
 */
export function getSignalSentence(items: AnalysisHistoryItem[]): string | null {
  const total = items.length;
  const maturity = getSampleMaturity(total);
  if (maturity === 'EMPTY' || maturity === 'STARTED') return null;

  const ranked = countByErrorType(items);
  if (ranked.length === 0) return null;

  const top = ranked[0];
  const tied = ranked.filter((entry) => entry.count === top.count);
  if (tied.length > 1) {
    const labels = tied.slice(0, 2).map((entry) => getErrorTypeLabel(entry.errorType));
    return `Nos erros analisados até agora, ${labels.join(' e ')} apareceram com a mesma frequência.`;
  }

  return `Nos erros analisados até agora, ${getErrorTypeLabel(top.errorType)} apareceu mais vezes (${top.count} de ${total}).`;
}

export function HistorySignals({ items }: { items: AnalysisHistoryItem[] }) {
  const total = items.length;
  const maturity = getSampleMaturity(total);
  const viewTracked = useRef(false);

  useEffect(() => {
    if (viewTracked.current || total === 0) return;
    viewTracked.current = true;
    trackActivationEvent('history_summary_viewed');
  }, [total]);

  if (maturity === 'EMPTY') return null;

  const ranked = countByErrorType(items);
  const warning = getSampleWarning(total);
  const sentence = getSignalSentence(items);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="history-signals-title">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Seus primeiros sinais</p>
      <h2 id="history-signals-title" className="mt-1 text-2xl font-bold tracking-tight">
        {total === 1 ? 'Você analisou 1 erro até agora.' : `Você analisou ${total} erros até agora.`}
      </h2>

      {maturity === 'STARTED' ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Seu histórico começou. A partir de três análises, dá para começar a olhar o que se repete.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {ranked.map((entry) => (
              <li key={entry.errorType} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{getErrorTypeLabel(entry.errorType)}</span>
                <span className="font-semibold tabular-nums">
                  {entry.count === 1 ? '1 erro' : `${entry.count} erros`}
                </span>
              </li>
            ))}
          </ul>

          {sentence ? (
            <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{sentence}</span>
            </p>
          ) : null}
        </>
      )}

      {warning ? (
        <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {warning}
        </p>
      ) : null}
    </section>
  );
}
