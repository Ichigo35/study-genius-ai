export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          space_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          space_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string
          created_at: string
          difficulty: string | null
          due_at: string
          ease_factor: number
          front: string
          id: string
          interval_days: number
          repetitions: number
          source_id: string | null
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back: string
          created_at?: string
          difficulty?: string | null
          due_at?: string
          ease_factor?: number
          front: string
          id?: string
          interval_days?: number
          repetitions?: number
          source_id?: string | null
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string
          created_at?: string
          difficulty?: string | null
          due_at?: string
          ease_factor?: number
          front?: string
          id?: string
          interval_days?: number
          repetitions?: number
          source_id?: string | null
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcards_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          quiz_id: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: string
          explanation: string | null
          id: string
          options: Json
          position: number
          question: string
          quiz_id: string
          type: string
          user_id: string
        }
        Insert: {
          correct_answer: string
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question: string
          quiz_id: string
          type?: string
          user_id: string
        }
        Update: {
          correct_answer?: string
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question?: string
          quiz_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          id: string
          question_count: number
          source_id: string | null
          space_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_count?: number
          source_id?: string | null
          space_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_count?: number
          source_id?: string | null
          space_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          detail_level: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          language: string | null
          original_url: string | null
          progress_step: string | null
          raw_text: string | null
          space_id: string
          status: string
          storage_path: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail_level?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          original_url?: string | null
          progress_step?: string | null
          raw_text?: string | null
          space_id: string
          status?: string
          storage_path?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail_level?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          language?: string | null
          original_url?: string | null
          progress_step?: string | null
          raw_text?: string | null
          space_id?: string
          status?: string
          storage_path?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_notes: {
        Row: {
          content: Json
          created_at: string
          detail_level: string
          id: string
          language: string | null
          source_id: string | null
          space_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          detail_level?: string
          id?: string
          language?: string | null
          source_id?: string | null
          space_id: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          detail_level?: string
          id?: string
          language?: string | null
          source_id?: string | null
          space_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_notes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          cards_reviewed: number
          created_at: string
          id: string
          kind: string
          space_id: string | null
          user_id: string
        }
        Insert: {
          cards_reviewed?: number
          created_at?: string
          id?: string
          kind?: string
          space_id?: string | null
          user_id: string
        }
        Update: {
          cards_reviewed?: number
          created_at?: string
          id?: string
          kind?: string
          space_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "study_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_spaces: {
        Row: {
          color: string
          created_at: string
          description: string | null
          emoji: string
          id: string
          last_activity_at: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          emoji?: string
          id?: string
          last_activity_at?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          emoji?: string
          id?: string
          last_activity_at?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          created_at: string
          full_text: string
          id: string
          language: string | null
          segments: Json
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          segments?: Json
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_text?: string
          id?: string
          language?: string | null
          segments?: Json
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          amount: number
          created_at: string
          day: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          day?: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          day?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_limits: {
        Row: {
          daily_analyses: number
          daily_audio_minutes: number
          daily_chat_messages: number
          daily_quizzes: number
          daily_videos: number
          plan: string
          updated_at: string
        }
        Insert: {
          daily_analyses?: number
          daily_audio_minutes?: number
          daily_chat_messages?: number
          daily_quizzes?: number
          daily_videos?: number
          plan: string
          updated_at?: string
        }
        Update: {
          daily_analyses?: number
          daily_audio_minutes?: number
          daily_chat_messages?: number
          daily_quizzes?: number
          daily_videos?: number
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          ai_output_language: string
          created_at: string
          delete_audio_after_transcription: boolean
          detail_level: string
          notifications_enabled: boolean
          study_level: string
          ui_language: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_output_language?: string
          created_at?: string
          delete_audio_after_transcription?: boolean
          detail_level?: string
          notifications_enabled?: boolean
          study_level?: string
          ui_language?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_output_language?: string
          created_at?: string
          delete_audio_after_transcription?: boolean
          detail_level?: string
          notifications_enabled?: boolean
          study_level?: string
          ui_language?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
