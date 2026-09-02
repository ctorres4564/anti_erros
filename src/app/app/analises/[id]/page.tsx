import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FullAnalysisResult } from '@/components/analysis/FullAnalysisResult';
import { createClient } from '@/lib/supabase/server';
import { isOnboardingComplete } from '@/services/onboarding';
import type { AnalysisView } from '@/types/analysis';

interface AnalysisDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AnalysisDetailPage({ params }: AnalysisDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/login');
  if (!(await isOnboardingComplete(user.id))) redirect('/onboarding');

  const { data: row, error } = await supabase.from('analyses').select('*').eq('id', id).maybeSingle();
  if (error || !row) notFound();

  const { data: feedback } = await supabase
    .from('analysis_feedback')
    .select('rating, comment, updated_at')
    .eq('analysis_id', id)
    .maybeSingle();

  const analysis: AnalysisView = {
    id: row.id,
    question: row.raw_question,
    userAnswer: row.user_answer,
    correctAnswer: row.correct_answer,
    studentReasoning: row.student_reasoning,
    discipline: row.discipline,
    confirmedDiscipline: row.discipline_confirmed,
    disciplineConfirmedAt: row.discipline_confirmed_at,
    feedback: feedback
      ? {
          rating: feedback.rating as 'YES' | 'PARTIALLY' | 'NO',
          comment: feedback.comment,
          updatedAt: feedback.updated_at,
        }
      : null,
    probableErrorType: row.error_type,
    confidence: row.ai_confidence,
    reasoningSummary: row.root_cause_explanation,
    recommendedAction: row.recommended_action,
    coreConcept: row.learning_gap_concept,
    cardAction: row.card_action,
    card:
      row.suggested_flashcard_front && row.suggested_flashcard_back
        ? { front: row.suggested_flashcard_front, back: row.suggested_flashcard_back }
        : null,
    createdAt: row.created_at,
  };

  return (
    <div className="space-y-5 py-4 sm:py-8">
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar ao histórico
      </Link>
      <FullAnalysisResult analysis={analysis} />
    </div>
  );
}
