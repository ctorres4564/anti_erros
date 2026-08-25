export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          ai_confidence: number
          correct_answer: string
          created_at: string
          error_type: string
          id: string
          is_flashcard_worthy: boolean
          learning_gap_concept: string
          model_version: string
          prompt_version: string
          raw_question: string
          root_cause_explanation: string
          suggested_flashcard_back: string | null
          suggested_flashcard_front: string | null
          user_answer: string
          user_hypothesis: string | null
          user_id: string
        }
        Insert: {
          ai_confidence: number
          correct_answer: string
          created_at?: string
          error_type: string
          id?: string
          is_flashcard_worthy?: boolean
          learning_gap_concept: string
          model_version: string
          prompt_version: string
          raw_question: string
          root_cause_explanation: string
          suggested_flashcard_back?: string | null
          suggested_flashcard_front?: string | null
          user_answer: string
          user_hypothesis?: string | null
          user_id: string
        }
        Update: {
          ai_confidence?: number
          correct_answer?: string
          created_at?: string
          error_type?: string
          id?: string
          is_flashcard_worthy?: boolean
          learning_gap_concept?: string
          model_version?: string
          prompt_version?: string
          raw_question?: string
          root_cause_explanation?: string
          suggested_flashcard_back?: string | null
          suggested_flashcard_front?: string | null
          user_answer?: string
          user_hypothesis?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_quotas: {
        Row: {
          created_at: string
          daily_limit: number
          id: string
          quota_date: string
          reserved_count: number
          updated_at: string
          used_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_limit?: number
          id?: string
          quota_date?: string
          reserved_count?: number
          updated_at?: string
          used_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          daily_limit?: number
          id?: string
          quota_date?: string
          reserved_count?: number
          updated_at?: string
          used_count?: number
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          event_name: string
          id: string
          properties: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_name: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_name?: string
          id?: string
          properties?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      idempotency_locks: {
        Row: {
          analysis_id: string | null
          created_at: string
          expires_at: string
          id: string
          idempotency_key: string
          quota_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key: string
          quota_date?: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          idempotency_key?: string
          quota_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          policy_version: string
          privacy_accepted: boolean
          terms_accepted: boolean
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version: string
          privacy_accepted?: boolean
          terms_accepted?: boolean
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version?: string
          privacy_accepted?: boolean
          terms_accepted?: boolean
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      marketing_consent_events: {
        Row: {
          consented: boolean
          created_at: string
          id: string
          ip_address: string | null
          policy_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          consented: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          consented?: boolean
          created_at?: string
          id?: string
          ip_address?: string | null
          policy_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_current_marketing_consent: {
        Row: {
          consented: boolean | null
          created_at: string | null
          id: string | null
          policy_version: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_onboarding: {
        Args: {
          p_email: string
          p_full_name: string
          p_ip_address?: string
          p_marketing_consented: boolean
          p_policy_version: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

