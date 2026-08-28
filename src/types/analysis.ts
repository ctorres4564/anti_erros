import type { UserAttribution } from '@/config/ai';

export interface AnalysisFormValues {
  question: string;
  userAnswer: string;
  correctAnswer: string;
  officialExplanation?: string;
  userAttribution: UserAttribution;
}
export interface AnalysisPreview {
  probableErrorType: string;
  concept: string;
  discipline: string;
  isAligned: boolean;
}

export interface AnalysisView {
  id: string;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  officialExplanation: string | null;
  discipline?: string | null;
  confirmedDiscipline?: string | null;
  disciplineConfirmedAt?: string | null;
  feedback?: AnalysisFeedback | null;
  probableErrorType: string;
  confidence: number;
  reasoningSummary: string;
  recommendedAction?: string | null;
  coreConcept: string;
  cardAction: string;
  card: { front: string; back: string } | null;
  createdAt: string;
}

export interface AnalysisFeedback {
  rating: 'YES' | 'PARTIALLY' | 'NO';
  comment: string | null;
  updatedAt: string;
}

export interface AnalysisHistoryItem {
  id: string;
  question: string;
  probableErrorType: string;
  recommendedAction: string | null;
  cardAction: string;
  discipline: string | null;
  confirmedDiscipline?: string | null;
  createdAt: string;
}
