export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          email?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      legal_acceptances: {
        Row: {
          id: string;
          user_id: string;
          terms_accepted: boolean;
          privacy_accepted: boolean;
          policy_version: string;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          terms_accepted?: boolean;
          privacy_accepted?: boolean;
          policy_version: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          terms_accepted?: boolean;
          privacy_accepted?: boolean;
          policy_version?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      marketing_consent_events: {
        Row: {
          id: string;
          user_id: string;
          consented: boolean;
          policy_version: string;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          consented: boolean;
          policy_version: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          consented?: boolean;
          policy_version?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_quotas: {
        Row: {
          id: string;
          user_id: string;
          quota_date: string;
          daily_limit: number;
          used_count: number;
          reserved_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          quota_date?: string;
          daily_limit?: number;
          used_count?: number;
          reserved_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          quota_date?: string;
          daily_limit?: number;
          used_count?: number;
          reserved_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      idempotency_locks: {
        Row: {
          id: string;
          user_id: string;
          idempotency_key: string;
          quota_date: string;
          status: 'PENDING' | 'COMPLETED' | 'FAILED';
          analysis_id: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          idempotency_key: string;
          quota_date?: string;
          status: 'PENDING' | 'COMPLETED' | 'FAILED';
          analysis_id?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          idempotency_key?: string;
          quota_date?: string;
          status?: 'PENDING' | 'COMPLETED' | 'FAILED';
          analysis_id?: string | null;
          expires_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      analyses: {
        Row: {
          id: string;
          user_id: string;
          raw_question: string;
          user_answer: string;
          correct_answer: string;
          user_hypothesis: string | null;
          error_type: string;
          root_cause_explanation: string;
          learning_gap_concept: string;
          suggested_flashcard_front: string | null;
          suggested_flashcard_back: string | null;
          is_flashcard_worthy: boolean;
          ai_confidence: number;
          model_version: string;
          prompt_version: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          raw_question: string;
          user_answer: string;
          correct_answer: string;
          user_hypothesis?: string | null;
          error_type: string;
          root_cause_explanation: string;
          learning_gap_concept: string;
          suggested_flashcard_front?: string | null;
          suggested_flashcard_back?: string | null;
          is_flashcard_worthy?: boolean;
          ai_confidence: number;
          model_version: string;
          prompt_version: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          raw_question?: string;
          user_answer?: string;
          correct_answer?: string;
          user_hypothesis?: string | null;
          error_type?: string;
          root_cause_explanation?: string;
          learning_gap_concept?: string;
          suggested_flashcard_front?: string | null;
          suggested_flashcard_back?: string | null;
          is_flashcard_worthy?: boolean;
          ai_confidence?: number;
          model_version?: string;
          prompt_version?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string | null;
          event_name: string;
          session_id: string | null;
          properties: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          event_name: string;
          session_id?: string | null;
          properties?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          event_name?: string;
          session_id?: string | null;
          properties?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      v_current_marketing_consent: {
        Row: {
          id: string;
          user_id: string;
          consented: boolean;
          policy_version: string;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {};
  };
  private: {
    Functions: {
      cleanup_expired_reservations: {
        Args: {
          target_user_id: string;
        };
        Returns: void;
      };
    };
  };
};
