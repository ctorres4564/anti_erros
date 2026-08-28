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
  probableErrorType: string;
  confidence: number;
  reasoningSummary: string;
  recommendedAction?: string | null;
  coreConcept: string;
  cardAction: string;
  card: { front: string; back: string } | null;
  createdAt: string;
}

export interface AnalysisHistoryItem {
  id: string;
  question: string;
  probableErrorType: string;
  recommendedAction: string | null;
  cardAction: string;
  discipline: string | null;
  createdAt: string;
}
