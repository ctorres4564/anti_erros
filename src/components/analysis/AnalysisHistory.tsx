import Link from 'next/link';
import { ArrowRight, Clock3, FileSearch } from 'lucide-react';
import {
  formatAnalysisDate,
  getCardDecisionLabel,
  getErrorTypeLabel,
  toConservativeLanguage,
  truncateQuestion,
} from '@/lib/analysis-presentation';
import type { AnalysisHistoryItem } from '@/types/analysis';

interface AnalysisHistoryProps {
  items: AnalysisHistoryItem[];
  unavailable?: boolean;
}

export function AnalysisHistory({ items, unavailable = false }: AnalysisHistoryProps) {
  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Seu aprendizado</p>
        <h2 id="history-title" className="mt-1 text-2xl font-bold tracking-tight">Histórico de análises</h2>
      </div>

      {unavailable ? (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          O histórico está temporariamente indisponível. Suas análises continuam salvas; tente atualizar a página mais tarde.
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <FileSearch className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <h3 className="mt-3 font-bold">Nenhuma análise salva ainda</h3>
          <p className="mt-1 text-sm text-muted-foreground">Sua próxima análise aparecerá aqui automaticamente.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {formatAnalysisDate(item.createdAt)}
                    {item.confirmedDiscipline || item.discipline ? ` · ${item.confirmedDiscipline || item.discipline}` : ''}
                  </p>
                  <h3 className="font-bold leading-snug">{truncateQuestion(item.question)}</h3>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">Causa provável:</span>{' '}
                    {getErrorTypeLabel(item.probableErrorType)}
                  </p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {item.recommendedAction
                      ? toConservativeLanguage(item.recommendedAction)
                      : 'Ação disponível no detalhe da análise.'}
                  </p>
                  <p className="text-xs font-semibold text-primary">{getCardDecisionLabel(item.cardAction)}</p>
                </div>
                <Link
                  href={`/app/analises/${item.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  Abrir detalhe
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
