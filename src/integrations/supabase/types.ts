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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analysis: {
        Row: {
          analyzed_at: string
          bedrooms: number | null
          budget_amount: number | null
          budget_currency: string | null
          city: string | null
          classification: Database["public"]["Enums"]["lead_classification"]
          email: string | null
          housing_type: Database["public"]["Enums"]["housing_type"]
          id: string
          language_code: string | null
          model_used: string
          neighborhood: string | null
          phone: string | null
          post_id: string
          reasoning: string | null
          rental_duration: Database["public"]["Enums"]["rental_duration"]
          score: number
          summary_fr: string
          whatsapp: string | null
        }
        Insert: {
          analyzed_at?: string
          bedrooms?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          city?: string | null
          classification: Database["public"]["Enums"]["lead_classification"]
          email?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"]
          id?: string
          language_code?: string | null
          model_used?: string
          neighborhood?: string | null
          phone?: string | null
          post_id: string
          reasoning?: string | null
          rental_duration?: Database["public"]["Enums"]["rental_duration"]
          score: number
          summary_fr: string
          whatsapp?: string | null
        }
        Update: {
          analyzed_at?: string
          bedrooms?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          city?: string | null
          classification?: Database["public"]["Enums"]["lead_classification"]
          email?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"]
          id?: string
          language_code?: string | null
          model_used?: string
          neighborhood?: string | null
          phone?: string | null
          post_id?: string
          reasoning?: string | null
          rental_duration?: Database["public"]["Enums"]["rental_duration"]
          score?: number
          summary_fr?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_language_code_fkey"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "analysis_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_profile: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          phone: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
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
      content_translations: {
        Row: {
          content: Json | null
          created_at: string
          error_message: string | null
          id: string
          kind: string
          language: string
          source_id: string
          status: string
          text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind: string
          language: string
          source_id: string
          status?: string
          text?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: string
          language?: string
          source_id?: string
          status?: string
          text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_translations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          note: string | null
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_translations: {
        Row: {
          back: string | null
          created_at: string
          error_message: string | null
          flashcard_id: string
          front: string | null
          id: string
          language: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          back?: string | null
          created_at?: string
          error_message?: string | null
          flashcard_id: string
          front?: string | null
          id?: string
          language: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          back?: string | null
          created_at?: string
          error_message?: string | null
          flashcard_id?: string
          front?: string | null
          id?: string
          language?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_translations_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
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
          language: string | null
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
          language?: string | null
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
          language?: string | null
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
      groups: {
        Row: {
          facebook_group_id: string | null
          first_seen_at: string
          id: string
          input_url: string | null
          last_seen_at: string
          leads_count: number
          posts_count: number
          title: string
        }
        Insert: {
          facebook_group_id?: string | null
          first_seen_at?: string
          id?: string
          input_url?: string | null
          last_seen_at?: string
          leads_count?: number
          posts_count?: number
          title: string
        }
        Update: {
          facebook_group_id?: string | null
          first_seen_at?: string
          id?: string
          input_url?: string | null
          last_seen_at?: string
          leads_count?: number
          posts_count?: number
          title?: string
        }
        Relationships: []
      }
      languages: {
        Row: {
          code: string
          flag_emoji: string | null
          label_fr: string
        }
        Insert: {
          code: string
          flag_emoji?: string | null
          label_fr: string
        }
        Update: {
          code?: string
          flag_emoji?: string | null
          label_fr?: string
        }
        Relationships: []
      }
      lead_scores: {
        Row: {
          classification: Database["public"]["Enums"]["lead_classification"]
          id: string
          model_used: string
          post_id: string
          score: number
          scored_at: string
        }
        Insert: {
          classification: Database["public"]["Enums"]["lead_classification"]
          id?: string
          model_used: string
          post_id: string
          score: number
          scored_at?: string
        }
        Update: {
          classification?: Database["public"]["Enums"]["lead_classification"]
          id?: string
          model_used?: string
          post_id?: string
          score?: number
          scored_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          post_id: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_status_history: {
        Row: {
          changed_at: string
          id: string
          note: string | null
          post_id: string
          status: Database["public"]["Enums"]["lead_pipeline_status"]
        }
        Insert: {
          changed_at?: string
          id?: string
          note?: string | null
          post_id: string
          status: Database["public"]["Enums"]["lead_pipeline_status"]
        }
        Update: {
          changed_at?: string
          id?: string
          note?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["lead_pipeline_status"]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_status_history_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_facebook_id: string | null
          author_name: string | null
          author_profile_pic: string | null
          comments_count: number
          created_at: string
          deleted_at: string | null
          duplicate_reason: string | null
          external_post_id: string
          facebook_url: string
          group_id: string | null
          id: string
          is_shared_post: boolean
          pipeline_status: Database["public"]["Enums"]["lead_pipeline_status"]
          pipeline_status_updated_at: string
          possible_duplicate_of: string | null
          posted_at: string | null
          raw: Json
          reactions_count: number
          shared_from_page: string | null
          shares_count: number
          text: string
          upload_id: string | null
        }
        Insert: {
          author_facebook_id?: string | null
          author_name?: string | null
          author_profile_pic?: string | null
          comments_count?: number
          created_at?: string
          deleted_at?: string | null
          duplicate_reason?: string | null
          external_post_id: string
          facebook_url: string
          group_id?: string | null
          id?: string
          is_shared_post?: boolean
          pipeline_status?: Database["public"]["Enums"]["lead_pipeline_status"]
          pipeline_status_updated_at?: string
          possible_duplicate_of?: string | null
          posted_at?: string | null
          raw: Json
          reactions_count?: number
          shared_from_page?: string | null
          shares_count?: number
          text: string
          upload_id?: string | null
        }
        Update: {
          author_facebook_id?: string | null
          author_name?: string | null
          author_profile_pic?: string | null
          comments_count?: number
          created_at?: string
          deleted_at?: string | null
          duplicate_reason?: string | null
          external_post_id?: string
          facebook_url?: string
          group_id?: string | null
          id?: string
          is_shared_post?: boolean
          pipeline_status?: Database["public"]["Enums"]["lead_pipeline_status"]
          pipeline_status_updated_at?: string
          possible_duplicate_of?: string | null
          posted_at?: string | null
          raw?: Json
          reactions_count?: number
          shared_from_page?: string | null
          shares_count?: number
          text?: string
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_possible_duplicate_of_fkey"
            columns: ["possible_duplicate_of"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          id: number
          price: number | null
          product_id: number
          "store-id": string | null
          "update-at": string | null
        }
        Insert: {
          id?: number
          price?: number | null
          product_id: number
          "store-id"?: string | null
          "update-at"?: string | null
        }
        Update: {
          id?: number
          price?: number | null
          product_id?: number
          "store-id"?: string | null
          "update-at"?: string | null
        }
        Relationships: []
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
      properties: {
        Row: {
          address: string | null
          bathrooms: number | null
          bedrooms: number | null
          city: string
          created_at: string
          currency: string
          description: string | null
          housing_type: Database["public"]["Enums"]["housing_type"]
          id: string
          is_active: boolean
          is_furnished: boolean | null
          neighborhood: string | null
          photo_url: string | null
          price_per_month: number
          reference: string | null
          source: string
          source_url: string | null
          surface_sqm: number | null
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city: string
          created_at?: string
          currency?: string
          description?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"]
          id?: string
          is_active?: boolean
          is_furnished?: boolean | null
          neighborhood?: string | null
          photo_url?: string | null
          price_per_month: number
          reference?: string | null
          source?: string
          source_url?: string | null
          surface_sqm?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          bathrooms?: number | null
          bedrooms?: number | null
          city?: string
          created_at?: string
          currency?: string
          description?: string | null
          housing_type?: Database["public"]["Enums"]["housing_type"]
          id?: string
          is_active?: boolean
          is_furnished?: boolean | null
          neighborhood?: string | null
          photo_url?: string | null
          price_per_month?: number
          reference?: string | null
          source?: string
          source_url?: string | null
          surface_sqm?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_matches: {
        Row: {
          created_at: string
          id: string
          match_score: number
          post_id: string
          property_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          match_score: number
          post_id: string
          property_id: string
        }
        Update: {
          created_at?: string
          id?: string
          match_score?: number
          post_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_matches_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_matches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
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
      quiz_translations: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          language: string
          questions: Json | null
          quiz_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          language: string
          questions?: Json | null
          quiz_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          language?: string
          questions?: Json | null
          quiz_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_translations_quiz_id_fkey"
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
          language: string | null
          question_count: number
          source_id: string | null
          space_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          question_count?: number
          source_id?: string | null
          space_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
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
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
      store: {
        Row: {
          id: number
          name: string
        }
        Insert: {
          id?: number
          name: string
        }
        Update: {
          id?: number
          name?: string
        }
        Relationships: []
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
      uploads: {
        Row: {
          completed_at: string | null
          entries_errors: number
          entries_total: number
          error_message: string | null
          file_size_bytes: number | null
          filename: string
          id: string
          posts_duplicates: number
          posts_new: number
          posts_raw: number
          status: Database["public"]["Enums"]["upload_status"]
          uploaded_at: string
        }
        Insert: {
          completed_at?: string | null
          entries_errors?: number
          entries_total?: number
          error_message?: string | null
          file_size_bytes?: number | null
          filename: string
          id?: string
          posts_duplicates?: number
          posts_new?: number
          posts_raw?: number
          status?: Database["public"]["Enums"]["upload_status"]
          uploaded_at?: string
        }
        Update: {
          completed_at?: string | null
          entries_errors?: number
          entries_total?: number
          error_message?: string | null
          file_size_bytes?: number | null
          filename?: string
          id?: string
          posts_duplicates?: number
          posts_new?: number
          posts_raw?: number
          status?: Database["public"]["Enums"]["upload_status"]
          uploaded_at?: string
        }
        Relationships: []
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
      find_similar_post: {
        Args: { p_post_id: string; p_text: string; p_threshold?: number }
        Returns: {
          id: string
          pipeline_status: Database["public"]["Enums"]["lead_pipeline_status"]
          similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      housing_type:
        | "appartement"
        | "maison"
        | "studio"
        | "condo"
        | "villa"
        | "chambre"
        | "colocation"
        | "maison_meublee"
        | "maison_vide"
        | "inconnu"
      lead_classification: "lead" | "peut_etre_lead" | "pas_un_lead"
      lead_pipeline_status:
        | "nouveau_lead"
        | "premier_contact_envoye"
        | "reponse_recue"
        | "qualifie"
        | "visite_programmee"
        | "negociation"
        | "gagne_ferme"
        | "perdu_ferme"
      log_level: "debug" | "info" | "warning" | "error"
      rental_duration: "courte_duree" | "longue_duree" | "inconnu"
      upload_status: "pending" | "processing" | "completed" | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      housing_type: [
        "appartement",
        "maison",
        "studio",
        "condo",
        "villa",
        "chambre",
        "colocation",
        "maison_meublee",
        "maison_vide",
        "inconnu",
      ],
      lead_classification: ["lead", "peut_etre_lead", "pas_un_lead"],
      lead_pipeline_status: [
        "nouveau_lead",
        "premier_contact_envoye",
        "reponse_recue",
        "qualifie",
        "visite_programmee",
        "negociation",
        "gagne_ferme",
        "perdu_ferme",
      ],
      log_level: ["debug", "info", "warning", "error"],
      rental_duration: ["courte_duree", "longue_duree", "inconnu"],
      upload_status: ["pending", "processing", "completed", "failed"],
    },
  },
} as const
