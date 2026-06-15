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
      ai_rules: {
        Row: {
          ai_passed: boolean | null
          ai_review_notes: string | null
          ai_score: number | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_global: boolean
          priority: number
          review_decision: string | null
          reviewed_at: string | null
          rule: string
          scope: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_passed?: boolean | null
          ai_review_notes?: string | null
          ai_score?: number | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          priority?: number
          review_decision?: string | null
          reviewed_at?: string | null
          rule: string
          scope?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_passed?: boolean | null
          ai_review_notes?: string | null
          ai_score?: number | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_global?: boolean
          priority?: number
          review_decision?: string | null
          reviewed_at?: string | null
          rule?: string
          scope?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string
          phone: string | null
          proposal_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message: string
          phone?: string | null
          proposal_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string
          phone?: string | null
          proposal_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      design_proposals: {
        Row: {
          ai_prompt: string | null
          budget: number | null
          color_palette: Json
          created_at: string
          custom_brands: Json
          dimension_unit: string
          existing_finishes: Json
          existing_plan_url: string | null
          finishes: Json
          furniture_suggestions: Json
          id: string
          input_type: string
          is_paid: boolean
          is_saved: boolean
          materials: Json
          name: string
          rendering_urls: Json
          room_height: number
          room_length: number
          room_type: string
          room_width: number
          saved_at: string | null
          selected_brands: Json
          sketchup_file_url: string | null
          source_feature: string
          space_use: string | null
          status: string
          style: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_prompt?: string | null
          budget?: number | null
          color_palette?: Json
          created_at?: string
          custom_brands?: Json
          dimension_unit?: string
          existing_finishes?: Json
          existing_plan_url?: string | null
          finishes?: Json
          furniture_suggestions?: Json
          id?: string
          input_type?: string
          is_paid?: boolean
          is_saved?: boolean
          materials?: Json
          name?: string
          rendering_urls?: Json
          room_height?: number
          room_length?: number
          room_type?: string
          room_width?: number
          saved_at?: string | null
          selected_brands?: Json
          sketchup_file_url?: string | null
          source_feature?: string
          space_use?: string | null
          status?: string
          style?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_prompt?: string | null
          budget?: number | null
          color_palette?: Json
          created_at?: string
          custom_brands?: Json
          dimension_unit?: string
          existing_finishes?: Json
          existing_plan_url?: string | null
          finishes?: Json
          furniture_suggestions?: Json
          id?: string
          input_type?: string
          is_paid?: boolean
          is_saved?: boolean
          materials?: Json
          name?: string
          rendering_urls?: Json
          room_height?: number
          room_length?: number
          room_type?: string
          room_width?: number
          saved_at?: string | null
          selected_brands?: Json
          sketchup_file_url?: string | null
          source_feature?: string
          space_use?: string | null
          status?: string
          style?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_usage: {
        Row: {
          created_at: string
          feature_type: string
          id: string
          updated_at: string
          usage_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_type: string
          id?: string
          updated_at?: string
          usage_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          feature_type?: string
          id?: string
          updated_at?: string
          usage_count?: number
          user_id?: string
        }
        Relationships: []
      }
      guest_credit_claims: {
        Row: {
          created_at: string
          remaining_credits: number
          user_id: string
        }
        Insert: {
          created_at?: string
          remaining_credits: number
          user_id: string
        }
        Update: {
          created_at?: string
          remaining_credits?: number
          user_id?: string
        }
        Relationships: []
      }
      iap_entitlements: {
        Row: {
          created_at: string
          entitlement_id: string
          expires_at: string | null
          id: string
          is_active: boolean
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entitlement_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entitlement_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      photo_ai_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      product_tearsheets: {
        Row: {
          category: string | null
          colors: Json
          created_at: string
          designer: string | null
          dimensions: Json
          fabric_options: Json
          finishes: Json
          floor_plan_uploaded_at: string | null
          floor_plan_url: string | null
          id: string
          is_verified: boolean
          materials: Json
          parsed_data: Json
          product_name: string
          product_url: string | null
          reference_image_url: string | null
          reference_images: Json
          shape_description: string | null
          subcategory: string | null
          tearsheet_pdf_url: string | null
          updated_at: string
          visual_blueprint: string | null
        }
        Insert: {
          category?: string | null
          colors?: Json
          created_at?: string
          designer?: string | null
          dimensions?: Json
          fabric_options?: Json
          finishes?: Json
          floor_plan_uploaded_at?: string | null
          floor_plan_url?: string | null
          id?: string
          is_verified?: boolean
          materials?: Json
          parsed_data?: Json
          product_name: string
          product_url?: string | null
          reference_image_url?: string | null
          reference_images?: Json
          shape_description?: string | null
          subcategory?: string | null
          tearsheet_pdf_url?: string | null
          updated_at?: string
          visual_blueprint?: string | null
        }
        Update: {
          category?: string | null
          colors?: Json
          created_at?: string
          designer?: string | null
          dimensions?: Json
          fabric_options?: Json
          finishes?: Json
          floor_plan_uploaded_at?: string | null
          floor_plan_url?: string | null
          id?: string
          is_verified?: boolean
          materials?: Json
          parsed_data?: Json
          product_name?: string
          product_url?: string | null
          reference_image_url?: string | null
          reference_images?: Json
          shape_description?: string | null
          subcategory?: string | null
          tearsheet_pdf_url?: string | null
          updated_at?: string
          visual_blueprint?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          email: string | null
          full_name: string | null
          has_free_access: boolean
          id: string
          starter_credits: number
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          has_free_access?: boolean
          id: string
          starter_credits?: number
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          has_free_access?: boolean
          id?: string
          starter_credits?: number
          updated_at?: string
        }
        Relationships: []
      }
      studio_projects: {
        Row: {
          created_at: string
          id: string
          mode: string
          name: string
          prompt: string
          render_image_url: string | null
          settings: Json
          source_image_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          name?: string
          prompt?: string
          render_image_url?: string | null
          settings?: Json
          source_image_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          name?: string
          prompt?: string
          render_image_url?: string | null
          settings?: Json
          source_image_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_cloud_outputs: {
        Row: {
          created_at: string
          expires_at: string | null
          filename: string | null
          id: string
          kind: string
          metadata: Json
          size_bytes: number | null
          source_url: string | null
          storage_path: string
          tool: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          filename?: string | null
          id?: string
          kind: string
          metadata?: Json
          size_bytes?: number | null
          source_url?: string | null
          storage_path: string
          tool: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          filename?: string | null
          id?: string
          kind?: string
          metadata?: Json
          size_bytes?: number | null
          source_url?: string | null
          storage_path?: string
          tool?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string
          id: string
          status: string
          subscription_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status: string
          subscription_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          subscription_type?: string
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
      consume_starter_credit_for_user: {
        Args: { _user_id: string }
        Returns: number
      }
      get_my_starter_credits: { Args: never; Returns: number }
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
