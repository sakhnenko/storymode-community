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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_chat_answers: {
        Row: {
          content: string
          created_at: string
          credits: number | null
          id: string
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          credits?: number | null
          id: string
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          credits?: number | null
          id?: string
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_answers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_reservations: {
        Row: {
          actual_credits: number | null
          created_at: string
          expires_at: string
          feature: string
          finished_at: string | null
          id: string
          ledger_id: string | null
          metadata: Json
          reserved_credits: number
          status: string
          user_id: string
        }
        Insert: {
          actual_credits?: number | null
          created_at?: string
          expires_at?: string
          feature: string
          finished_at?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          reserved_credits: number
          status?: string
          user_id: string
        }
        Update: {
          actual_credits?: number | null
          created_at?: string
          expires_at?: string
          feature?: string
          finished_at?: string | null
          id?: string
          ledger_id?: string | null
          metadata?: Json
          reserved_credits?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_reservations_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_editor_bench_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_baseline: boolean
          options: Json
          results: Json
          summary: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_baseline?: boolean
          options?: Json
          results?: Json
          summary?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_baseline?: boolean
          options?: Json
          results?: Json
          summary?: Json
        }
        Relationships: []
      }
      ai_model_settings: {
        Row: {
          creative: string
          fast: string
          images: string
          singleton: boolean
          thoughtful: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          creative?: string
          fast?: string
          images?: string
          singleton?: boolean
          thoughtful?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          creative?: string
          fast?: string
          images?: string
          singleton?: boolean
          thoughtful?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      canvas_shares: {
        Row: {
          created_at: string
          grid_id: string
          id: string
          owner_id: string
          shared_with_email: string
          shared_with_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grid_id: string
          id?: string
          owner_id: string
          shared_with_email: string
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grid_id?: string
          id?: string
          owner_id?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_shares_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "notebook_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_review_highlights: {
        Row: {
          ai_critique: string | null
          ai_error: string | null
          ai_status: string
          ai_suggestions: Json | null
          chapter_id: string
          context_after: string | null
          context_before: string | null
          created_at: string
          draft_id: string | null
          id: string
          intent: string
          quote: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_critique?: string | null
          ai_error?: string | null
          ai_status?: string
          ai_suggestions?: Json | null
          chapter_id: string
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          intent: string
          quote: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_critique?: string | null
          ai_error?: string | null
          ai_status?: string
          ai_suggestions?: Json | null
          chapter_id?: string
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          draft_id?: string | null
          id?: string
          intent?: string
          quote?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_review_highlights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapter_review_highlights_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "story_chapter_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_snapshots: {
        Row: {
          content: string
          created_at: string
          day: string
          entity_id: string
          entity_type: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          day: string
          entity_id: string
          entity_type: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          day?: string
          entity_id?: string
          entity_type?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          actor: string | null
          bucket: string
          created_at: string
          delta: number
          id: string
          kind: string
          metadata: Json
          reason: string | null
          user_id: string
        }
        Insert: {
          actor?: string | null
          bucket?: string
          created_at?: string
          delta: number
          id?: string
          kind: string
          metadata?: Json
          reason?: string | null
          user_id: string
        }
        Update: {
          actor?: string | null
          bucket?: string
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          metadata?: Json
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      credit_purchase_receipts: {
        Row: {
          credits: number
          ledger_id: string | null
          pack_id: string
          processed_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          credits: number
          ledger_id?: string | null
          pack_id: string
          processed_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          credits?: number
          ledger_id?: string | null
          pack_id?: string
          processed_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_purchase_receipts_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: true
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          disabled: boolean
          enabled_for_all: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          disabled?: boolean
          enabled_for_all?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          disabled?: boolean
          enabled_for_all?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      grid_layouts: {
        Row: {
          col_sizes: string[]
          created_at: string
          id: string
          row_sizes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          col_sizes?: string[]
          created_at?: string
          id?: string
          row_sizes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          col_sizes?: string[]
          created_at?: string
          id?: string
          row_sizes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      map_canvas: {
        Row: {
          bg_color: string
          cells: Json
          created_at: string
          id: string
          offset_x: number
          offset_y: number
          placed_notebooks: Json
          position: number
          project_id: string | null
          title: string
          updated_at: string
          user_id: string
          zoom: number
        }
        Insert: {
          bg_color?: string
          cells?: Json
          created_at?: string
          id?: string
          offset_x?: number
          offset_y?: number
          placed_notebooks?: Json
          position?: number
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
          zoom?: number
        }
        Update: {
          bg_color?: string
          cells?: Json
          created_at?: string
          id?: string
          offset_x?: number
          offset_y?: number
          placed_notebooks?: Json
          position?: number
          project_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          zoom?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_canvas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_grids: {
        Row: {
          col_sizes: string[]
          created_at: string
          icon: string
          id: string
          is_public: boolean
          position: number
          project_id: string | null
          row_sizes: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          col_sizes?: string[]
          created_at?: string
          icon?: string
          id?: string
          is_public?: boolean
          position?: number
          project_id?: string | null
          row_sizes?: string[]
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          col_sizes?: string[]
          created_at?: string
          icon?: string
          id?: string
          is_public?: boolean
          position?: number
          project_id?: string | null
          row_sizes?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_grids_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notepads: {
        Row: {
          chapter_id: string | null
          col_index: number
          content: string
          created_at: string
          font: string
          font_size: string
          grid_id: string | null
          height: number
          icon: string | null
          id: string
          row_index: number
          theme: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          col_index?: number
          content?: string
          created_at?: string
          font?: string
          font_size?: string
          grid_id?: string | null
          height?: number
          icon?: string | null
          id?: string
          row_index?: number
          theme?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          col_index?: number
          content?: string
          created_at?: string
          font?: string
          font_size?: string
          grid_id?: string | null
          height?: number
          icon?: string | null
          id?: string
          row_index?: number
          theme?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notepads_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notepads_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "notebook_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          preferred_language: string
          updated_at: string
          user_id: string
          welcome_seen_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
          user_id: string
          welcome_seen_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
          user_id?: string
          welcome_seen_at?: string | null
        }
        Relationships: []
      }
      project_codex_layouts: {
        Row: {
          layout: Json
          project_id: string
          updated_at: string
        }
        Insert: {
          layout?: Json
          project_id: string
          updated_at?: string
        }
        Update: {
          layout?: Json
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_codex_layouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory_chapters: {
        Row: {
          analyzed_at: string
          chapter_id: string
          claims: Json
          draft_id: string | null
          entities: Json
          project_id: string
          revision: string
          version: number
          writing_kind: string
        }
        Insert: {
          analyzed_at?: string
          chapter_id: string
          claims: Json
          draft_id?: string | null
          entities?: Json
          project_id: string
          revision: string
          version?: number
          writing_kind: string
        }
        Update: {
          analyzed_at?: string
          chapter_id?: string
          claims?: Json
          draft_id?: string | null
          entities?: Json
          project_id?: string
          revision?: string
          version?: number
          writing_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: true
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory_identities: {
        Row: {
          created_at: string
          keep: string | null
          kind: string
          name_a: string
          name_b: string
          project_id: string
          same: boolean
        }
        Insert: {
          created_at?: string
          keep?: string | null
          kind: string
          name_a: string
          name_b: string
          project_id: string
          same: boolean
        }
        Update: {
          created_at?: string
          keep?: string | null
          kind?: string
          name_a?: string
          name_b?: string
          project_id?: string
          same?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_identities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory_jobs: {
        Row: {
          chapter_id: string
          project_id: string
          started_at: string
          status: string
          token: string
        }
        Insert: {
          chapter_id: string
          project_id: string
          started_at?: string
          status: string
          token?: string
        }
        Update: {
          chapter_id?: string
          project_id?: string
          started_at?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_jobs_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: true
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memory_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memory_overrides: {
        Row: {
          chapter_id: string
          claim_key: string
          correction: string
          disposition: string
        }
        Insert: {
          chapter_id: string
          claim_key: string
          correction?: string
          disposition: string
        }
        Update: {
          chapter_id?: string
          claim_key?: string
          correction?: string
          disposition?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_overrides_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      project_shares: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          project_id: string
          shared_with_email: string
          shared_with_user_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          project_id: string
          shared_with_email: string
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string
          shared_with_email?: string
          shared_with_user_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_writing_profiles: {
        Row: {
          enabled: boolean
          genre: string
          guidance: string
          project_id: string
          register: string
        }
        Insert: {
          enabled?: boolean
          genre?: string
          guidance?: string
          project_id: string
          register?: string
        }
        Update: {
          enabled?: boolean
          genre?: string
          guidance?: string
          project_id?: string
          register?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_writing_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ai_language: string
          created_at: string
          icon: string
          id: string
          is_public: boolean
          is_starter: boolean
          is_template: boolean
          position: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_language?: string
          created_at?: string
          icon?: string
          id?: string
          is_public?: boolean
          is_starter?: boolean
          is_template?: boolean
          position?: number
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_language?: string
          created_at?: string
          icon?: string
          id?: string
          is_public?: boolean
          is_starter?: boolean
          is_template?: boolean
          position?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      signup_settings: {
        Row: {
          allowed_emails: string[]
          open: boolean
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_emails?: string[]
          open?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_emails?: string[]
          open?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      starter_template_config: {
        Row: {
          configured_at: string
          project_id: string
          singleton: boolean
        }
        Insert: {
          configured_at?: string
          project_id: string
          singleton?: boolean
        }
        Update: {
          configured_at?: string
          project_id?: string
          singleton?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "starter_template_config_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_chapter_drafts: {
        Row: {
          chapter_id: string
          content: string
          created_at: string
          draft_number: number
          id: string
          name: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          content?: string
          created_at?: string
          draft_number: number
          id?: string
          name?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          content?: string
          created_at?: string
          draft_number?: number
          id?: string
          name?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_chapter_drafts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "story_chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      story_chapters: {
        Row: {
          active_draft_id: string | null
          content: string
          created_at: string
          id: string
          position: number
          project_id: string
          theme: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active_draft_id?: string | null
          content?: string
          created_at?: string
          id?: string
          position?: number
          project_id: string
          theme?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active_draft_id?: string | null
          content?: string
          created_at?: string
          id?: string
          position?: number
          project_id?: string
          theme?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_chapters_active_draft_id_fkey"
            columns: ["active_draft_id"]
            isOneToOne: false
            referencedRelation: "story_chapter_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_ai_usage: {
        Row: {
          count: number
          feature: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          feature: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          feature?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          id: string
          openai_key_ciphertext: string | null
          openai_key_iv: string | null
          openai_key_last4: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          openai_key_ciphertext?: string | null
          openai_key_iv?: string | null
          openai_key_last4?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          openai_key_ciphertext?: string | null
          openai_key_iv?: string | null
          openai_key_last4?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          created_at: string
          credits_included: number
          credits_purchased: number
          credits_used: number
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_included?: number
          credits_purchased?: number
          credits_used?: number
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_included?: number
          credits_purchased?: number
          credits_used?: number
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          project_detail: string | null
          project_id: string | null
          project_type: string | null
          setup_attempts: number
          updated_at: string
          user_id: string
          welcome_message: string | null
          writing_about: string | null
          writing_language: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          project_detail?: string | null
          project_id?: string | null
          project_type?: string | null
          setup_attempts?: number
          updated_at?: string
          user_id: string
          welcome_message?: string | null
          writing_about?: string | null
          writing_language?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          project_detail?: string | null
          project_id?: string | null
          project_type?: string | null
          setup_attempts?: number
          updated_at?: string
          user_id?: string
          welcome_message?: string | null
          writing_about?: string | null
          writing_language?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_plans: {
        Row: {
          created_at: string
          id: string
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          has_own_openai_key: boolean | null
          id: string
          invited_at: string | null
          invited_plan: string | null
          name: string | null
          project_detail: string | null
          project_type: string | null
          source: string | null
          status: string
          ui_language: string | null
          updated_at: string
          writing_about: string | null
          writing_language: string | null
        }
        Insert: {
          created_at?: string
          email: string
          has_own_openai_key?: boolean | null
          id?: string
          invited_at?: string | null
          invited_plan?: string | null
          name?: string | null
          project_detail?: string | null
          project_type?: string | null
          source?: string | null
          status?: string
          ui_language?: string | null
          updated_at?: string
          writing_about?: string | null
          writing_language?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          has_own_openai_key?: boolean | null
          id?: string
          invited_at?: string | null
          invited_plan?: string | null
          name?: string | null
          project_detail?: string | null
          project_type?: string | null
          source?: string | null
          status?: string
          ui_language?: string | null
          updated_at?: string
          writing_about?: string | null
          writing_language?: string | null
        }
        Relationships: []
      }
      waitlist_ai_reply_usage: {
        Row: {
          ip_hash: string
          period_start: string
          reply_count: number
        }
        Insert: {
          ip_hash: string
          period_start: string
          reply_count?: number
        }
        Update: {
          ip_hash?: string
          period_start?: string
          reply_count?: number
        }
        Relationships: []
      }
      waitlist_notification_deliveries: {
        Row: {
          claimed_at: string
          last_error: string | null
          sent_at: string | null
          status: string
          waitlist_id: string
        }
        Insert: {
          claimed_at?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          waitlist_id: string
        }
        Update: {
          claimed_at?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_notification_deliveries_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: true
            referencedRelation: "waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_notification_rate_limits: {
        Row: {
          ip_hash: string
          request_count: number
          window_start: string
        }
        Insert: {
          ip_hash: string
          request_count?: number
          window_start: string
        }
        Update: {
          ip_hash?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      workos_outreach_reviews: {
        Row: {
          body: string
          follow_up_on: string | null
          notes: string
          prospect_id: string
          status: string
          subject: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string
          follow_up_on?: string | null
          notes?: string
          prospect_id: string
          status?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          follow_up_on?: string | null
          notes?: string
          prospect_id?: string
          status?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      workos_reporting_coverage: {
        Row: {
          name: string
          started_at: string
        }
        Insert: {
          name: string
          started_at?: string
        }
        Update: {
          name?: string
          started_at?: string
        }
        Relationships: []
      }
      workos_waitlist_joins: {
        Row: {
          backfilled: boolean
          converted_at: string | null
          invited_at: string | null
          joined_at: string
          removed_at: string | null
          source: string | null
          waitlist_id: string
        }
        Insert: {
          backfilled?: boolean
          converted_at?: string | null
          invited_at?: string | null
          joined_at: string
          removed_at?: string | null
          source?: string | null
          waitlist_id: string
        }
        Update: {
          backfilled?: boolean
          converted_at?: string | null
          invited_at?: string | null
          joined_at?: string
          removed_at?: string | null
          source?: string | null
          waitlist_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_editor_usage: {
        Args: { _days?: number }
        Returns: {
          answers: number
          cached_share: number
          context: string
          credits: number
          empty_answers: number
          median_credits: number
          median_first_text_ms: number
          median_input_tokens: number
          median_output_tokens: number
          model: string
          p95_first_text_ms: number
          speed: string
          tiers: string
          writers: number
        }[]
      }
      apply_credit_period_reset: {
        Args: { _user_id: string }
        Returns: undefined
      }
      begin_project_memory: {
        Args: {
          _chapter_id: string
          _project_id: string
          _user_id: string
          _version?: number
        }
        Returns: Json
      }
      bump_ai_usage: {
        Args: { _feature: string; _user_id: string }
        Returns: number
      }
      can_use_feature: { Args: { _key: string }; Returns: boolean }
      can_view_profile: { Args: { _target_user_id: string }; Returns: boolean }
      claim_waitlist_ai_reply: {
        Args: {
          _ip_hash: string
          _max_replies_per_visitor: number
          _max_visitors: number
        }
        Returns: boolean
      }
      clone_project_for_user: {
        Args: { _source_project_id: string; _target_user_id: string }
        Returns: string
      }
      complete_waitlist_notification: {
        Args: { _error?: string; _sent: boolean; _waitlist_id: string }
        Returns: undefined
      }
      edit_project_memory_claim: {
        Args: {
          _chapter_id: string
          _correction?: string
          _disposition: string
          _key: string
          _project_id: string
        }
        Returns: undefined
      }
      ensure_starter_project: { Args: { _user_id: string }; Returns: string }
      ensure_user_credits: { Args: { _user_id: string }; Returns: undefined }
      fail_project_memory: {
        Args: { _chapter_id: string; _token: string }
        Returns: undefined
      }
      feature_open_to_everyone: { Args: { _key: string }; Returns: boolean }
      finish_project_memory: {
        Args: {
          _chapter_id: string
          _claims: Json
          _entities?: Json
          _project_id: string
          _revision: string
          _token: string
          _user_id: string
          _version?: number
          _writing_kind: string
        }
        Returns: undefined
      }
      get_ai_quota: {
        Args: { _feature: string; _user_id: string }
        Returns: number
      }
      get_current_ai_usage: {
        Args: { _feature: string; _user_id: string }
        Returns: number
      }
      get_my_credits: { Args: never; Returns: Json }
      get_my_shared_grid_ids: {
        Args: never
        Returns: {
          grid_id: string
        }[]
      }
      get_user_plan: { Args: { _user_id: string }; Returns: string }
      grant_credit_purchase: {
        Args: {
          _actor: string
          _credits: number
          _pack_id: string
          _session_id: string
          _user_id: string
        }
        Returns: Json
      }
      grant_credits: {
        Args: {
          _actor: string
          _amount: number
          _kind: string
          _reason: string
          _user_id: string
        }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_chapter: { Args: { _chapter_id: string }; Returns: boolean }
      owns_grid: { Args: { _grid_id: string }; Returns: boolean }
      owns_project: { Args: { _project_id: string }; Returns: boolean }
      plan_credit_defaults: { Args: { _plan: string }; Returns: number }
      project_memory_source: {
        Args: { _chapter_id: string; _project_id: string }
        Returns: Json
      }
      read_project_memory: { Args: { _project_id: string }; Returns: Json }
      refund_ai_charge: { Args: { _ledger_id: string }; Returns: Json }
      register_waitlist_submission: {
        Args: {
          _email: string
          _has_own_openai_key: boolean
          _ip_hash: string
          _name: string
          _project_detail?: string
          _project_type?: string
          _source: string
          _ui_language?: string
          _writing_about: string
          _writing_language: string
        }
        Returns: Json
      }
      release_ai_credit_reservation: {
        Args: { _reason?: string; _reservation_id: string; _user_id: string }
        Returns: Json
      }
      reorder_notepads: {
        Args: { _grid_id: string; _updates: Json }
        Returns: undefined
      }
      reserve_ai_credits: {
        Args: { _feature: string; _minimum: number; _user_id: string }
        Returns: Json
      }
      seed_new_user_from_template: {
        Args: { _new_user_id: string }
        Returns: undefined
      }
      set_project_memory_identity: {
        Args: {
          _a: string
          _b: string
          _keep?: string
          _kind: string
          _project_id: string
          _same: boolean
        }
        Returns: undefined
      }
      settle_ai_credit_reservation: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _reservation_id: string
          _user_id: string
        }
        Returns: Json
      }
      signup_allowed: { Args: { _email: string }; Returns: boolean }
      spend_credits: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason: string
          _user_id: string
        }
        Returns: Json
      }
      upsert_content_snapshot: {
        Args: {
          _content: string
          _entity_id: string
          _entity_type: string
          _title: string
        }
        Returns: {
          content: string
          created_at: string
          day: string
          entity_id: string
          entity_type: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "content_snapshots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workos_business_snapshot: { Args: never; Returns: Json }
      workos_outreach_review_save: {
        Args: {
          p_body: string
          p_expected_version: number
          p_follow_up: string
          p_id: string
          p_notes: string
          p_status: string
          p_subject: string
        }
        Returns: Json
      }
      workos_outreach_reviews_read: { Args: never; Returns: Json }
      workos_snapshot: { Args: never; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
