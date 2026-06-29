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
      api_keys: {
        Row: {
          active: boolean
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at: string | null
          rate_limit_per_min: number
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          label: string
          last_used_at?: string | null
          rate_limit_per_min?: number
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          label?: string
          last_used_at?: string | null
          rate_limit_per_min?: number
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          api_key_id: string
          count: number
          window_start: string
        }
        Insert: {
          api_key_id: string
          count?: number
          window_start: string
        }
        Update: {
          api_key_id?: string
          count?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      day_expenses: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          operational_day_id: string
          type: Database["public"]["Enums"]["expense_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          operational_day_id: string
          type: Database["public"]["Enums"]["expense_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          operational_day_id?: string
          type?: Database["public"]["Enums"]["expense_type"]
        }
        Relationships: [
          {
            foreignKeyName: "day_expenses_operational_day_id_fkey"
            columns: ["operational_day_id"]
            isOneToOne: false
            referencedRelation: "operational_days"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          code: string
          default_rate: number | null
          group_type: string
          id: string
          name: string
          rate_basis: Database["public"]["Enums"]["rate_basis"] | null
          sort_order: number
          subgroup: string | null
        }
        Insert: {
          active?: boolean
          code: string
          default_rate?: number | null
          group_type: string
          id?: string
          name: string
          rate_basis?: Database["public"]["Enums"]["rate_basis"] | null
          sort_order?: number
          subgroup?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          default_rate?: number | null
          group_type?: string
          id?: string
          name?: string
          rate_basis?: Database["public"]["Enums"]["rate_basis"] | null
          sort_order?: number
          subgroup?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expense_category_id: string
          id: string
          incurred_on: string
          operational_day_id: string | null
          sociedad: string | null
          supplier: string | null
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          expense_category_id: string
          id?: string
          incurred_on: string
          operational_day_id?: string | null
          sociedad?: string | null
          supplier?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_category_id?: string
          id?: string
          incurred_on?: string
          operational_day_id?: string | null
          sociedad?: string | null
          supplier?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_expense_category_id_fkey"
            columns: ["expense_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_operational_day_id_fkey"
            columns: ["operational_day_id"]
            isOneToOne: false
            referencedRelation: "operational_days"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_settings: {
        Row: {
          fuel_price_per_flight: number
          hangar_price_per_day: number
          id: string
          packer_fee_per_jump: number
          updated_at: string
        }
        Insert: {
          fuel_price_per_flight?: number
          hangar_price_per_day?: number
          id?: string
          packer_fee_per_jump?: number
          updated_at?: string
        }
        Update: {
          fuel_price_per_flight?: number
          hangar_price_per_day?: number
          id?: string
          packer_fee_per_jump?: number
          updated_at?: string
        }
        Relationships: []
      }
      flights: {
        Row: {
          actual_departure_time: string | null
          created_at: string
          estimated_departure_time: string | null
          flight_number: number
          id: string
          is_back_to_back: boolean
          operational_day_id: string
          order_index: number
          status: Database["public"]["Enums"]["flight_status"]
        }
        Insert: {
          actual_departure_time?: string | null
          created_at?: string
          estimated_departure_time?: string | null
          flight_number: number
          id?: string
          is_back_to_back?: boolean
          operational_day_id: string
          order_index: number
          status?: Database["public"]["Enums"]["flight_status"]
        }
        Update: {
          actual_departure_time?: string | null
          created_at?: string
          estimated_departure_time?: string | null
          flight_number?: number
          id?: string
          is_back_to_back?: boolean
          operational_day_id?: string
          order_index?: number
          status?: Database["public"]["Enums"]["flight_status"]
        }
        Relationships: [
          {
            foreignKeyName: "flights_operational_day_id_fkey"
            columns: ["operational_day_id"]
            isOneToOne: false
            referencedRelation: "operational_days"
            referencedColumns: ["id"]
          },
        ]
      }
      instructors: {
        Row: {
          active: boolean
          created_at: string
          fee_per_jump: number
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          fee_per_jump?: number
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          fee_per_jump?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      operational_days: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          updated_at: string
          weather_status: Database["public"]["Enums"]["weather_status"]
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          notes?: string | null
          updated_at?: string
          weather_status?: Database["public"]["Enums"]["weather_status"]
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          updated_at?: string
          weather_status?: Database["public"]["Enums"]["weather_status"]
        }
        Relationships: []
      }
      participant_items: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          notes: string | null
          participant_id: string
          product_id: string
          quantity: number
          unit_price: number
          vat_rate: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          participant_id: string
          product_id: string
          quantity?: number
          unit_price: number
          vat_rate?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          participant_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participant_items_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          assigned_instructor_id: string | null
          channel: string
          check_in_completed: boolean
          confirmed_date: string | null
          confirmed_time: string | null
          created_at: string
          created_by: string | null
          deposit_paid: boolean
          email: string | null
          flight_id: string | null
          full_name: string
          geared_up: boolean
          id: string
          lead_status: string | null
          notes: string | null
          operational_status: Database["public"]["Enums"]["operational_status"]
          overweight_fee: number
          package_type: Database["public"]["Enums"]["package_type"]
          phone: string | null
          preferred_date: string | null
          preferred_time: string | null
          reservation_group_id: string | null
          token: string | null
          updated_at: string
          waiver_signed: boolean
          weight: number | null
        }
        Insert: {
          assigned_instructor_id?: string | null
          channel?: string
          check_in_completed?: boolean
          confirmed_date?: string | null
          confirmed_time?: string | null
          created_at?: string
          created_by?: string | null
          deposit_paid?: boolean
          email?: string | null
          flight_id?: string | null
          full_name: string
          geared_up?: boolean
          id?: string
          lead_status?: string | null
          notes?: string | null
          operational_status?: Database["public"]["Enums"]["operational_status"]
          overweight_fee?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          phone?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          reservation_group_id?: string | null
          token?: string | null
          updated_at?: string
          waiver_signed?: boolean
          weight?: number | null
        }
        Update: {
          assigned_instructor_id?: string | null
          channel?: string
          check_in_completed?: boolean
          confirmed_date?: string | null
          confirmed_time?: string | null
          created_at?: string
          created_by?: string | null
          deposit_paid?: boolean
          email?: string | null
          flight_id?: string | null
          full_name?: string
          geared_up?: boolean
          id?: string
          lead_status?: string | null
          notes?: string | null
          operational_status?: Database["public"]["Enums"]["operational_status"]
          overweight_fee?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          phone?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          reservation_group_id?: string | null
          token?: string | null
          updated_at?: string
          waiver_signed?: boolean
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_assigned_instructor_id_fkey"
            columns: ["assigned_instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_reservation_group_id_fkey"
            columns: ["reservation_group_id"]
            isOneToOne: false
            referencedRelation: "reservation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          participant_id: string
          stage: Database["public"]["Enums"]["payment_stage"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          participant_id: string
          stage: Database["public"]["Enums"]["payment_stage"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          participant_id?: string
          stage?: Database["public"]["Enums"]["payment_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          base_price: number
          category: Database["public"]["Enums"]["product_category"]
          code: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          active?: boolean
          base_price?: number
          category: Database["public"]["Enums"]["product_category"]
          code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          active?: boolean
          base_price?: number
          category?: Database["public"]["Enums"]["product_category"]
          code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: []
      }
      reservation_groups: {
        Row: {
          channel: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payer_name: string | null
          source: Database["public"]["Enums"]["reservation_source"]
        }
        Insert: {
          channel?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
        }
        Update: {
          channel?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payer_name?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
        }
        Relationships: []
      }
      sale_channels: {
        Row: {
          active: boolean
          channel_kind: string
          code: string
          commission_pct: number | null
          created_at: string
          id: string
          name: string
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          channel_kind: string
          code: string
          commission_pct?: number | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          channel_kind?: string
          code?: string
          commission_pct?: number | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      waivers: {
        Row: {
          accepted: boolean
          created_at: string
          document_type: string
          form_data: Json | null
          id: string
          participant_id: string
          pdf_url: string | null
          signature_url: string | null
          signed_at: string
          status: string
          token: string
        }
        Insert: {
          accepted?: boolean
          created_at?: string
          document_type?: string
          form_data?: Json | null
          id?: string
          participant_id: string
          pdf_url?: string | null
          signature_url?: string | null
          signed_at?: string
          status?: string
          token?: string
        }
        Update: {
          accepted?: boolean
          created_at?: string
          document_type?: string
          form_data?: Json | null
          id?: string
          participant_id?: string
          pdf_url?: string | null
          signature_url?: string | null
          signed_at?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "waivers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_rate_limit: {
        Args: { p_api_key_id: string; p_limit_per_min: number }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      reservations_assign_seat: {
        Args: { p_date: string; p_lead_id: string }
        Returns: {
          confirmed_time: string
          flight_id: string
        }[]
      }
    }
    Enums: {
      expense_type: "FUEL_OVERRIDE" | "HANGAR_OVERRIDE" | "CUSTOM"
      flight_status:
        | "SCHEDULED"
        | "BOARDING"
        | "IN_AIR"
        | "COMPLETED"
        | "DELAYED"
        | "CANCELLED"
      operational_status:
        | "PENDING"
        | "CHECKED_IN"
        | "WAIVER_SIGNED"
        | "BRIEFED"
        | "GEARED_UP"
        | "READY"
        | "COMPLETED"
        | "CANCELLED"
        | "NO_SHOW"
        | "WEATHER_CANCELLED"
      package_type:
        | "SOLO"
        | "HANDYCAM"
        | "VIDEO_EXTERNO"
        | "FOTOS"
        | "HANDYCAM_FOTOS"
      payment_method:
        | "EFECTIVO"
        | "TARJETA"
        | "BIZUM"
        | "TRANSFERENCIA"
        | "GROUPON"
      payment_stage: "RESERVA" | "LIQUIDACION" | "SUPLEMENTO"
      product_category:
        | "TANDEM_BASE"
        | "CAMERA_HANDYCAM"
        | "CAMERA_EXTERNAL"
        | "PHOTOS"
        | "OVERWEIGHT"
        | "GROUND_REPORT"
        | "OTHER"
      rate_basis: "PER_FLIGHT" | "PER_JUMP" | "FIXED_PER_DAY"
      reservation_source: "DIRECT" | "GROUPON" | "BONO" | "PROMO" | "SMARTBOX"
      weather_status: "OK" | "MARGINAL" | "CANCELLED"
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
    Enums: {
      expense_type: ["FUEL_OVERRIDE", "HANGAR_OVERRIDE", "CUSTOM"],
      flight_status: [
        "SCHEDULED",
        "BOARDING",
        "IN_AIR",
        "COMPLETED",
        "DELAYED",
        "CANCELLED",
      ],
      operational_status: [
        "PENDING",
        "CHECKED_IN",
        "WAIVER_SIGNED",
        "BRIEFED",
        "GEARED_UP",
        "READY",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
        "WEATHER_CANCELLED",
      ],
      package_type: [
        "SOLO",
        "HANDYCAM",
        "VIDEO_EXTERNO",
        "FOTOS",
        "HANDYCAM_FOTOS",
      ],
      payment_method: [
        "EFECTIVO",
        "TARJETA",
        "BIZUM",
        "TRANSFERENCIA",
        "GROUPON",
      ],
      payment_stage: ["RESERVA", "LIQUIDACION", "SUPLEMENTO"],
      product_category: [
        "TANDEM_BASE",
        "CAMERA_HANDYCAM",
        "CAMERA_EXTERNAL",
        "PHOTOS",
        "OVERWEIGHT",
        "GROUND_REPORT",
        "OTHER",
      ],
      rate_basis: ["PER_FLIGHT", "PER_JUMP", "FIXED_PER_DAY"],
      reservation_source: ["DIRECT", "GROUPON", "BONO", "PROMO", "SMARTBOX"],
      weather_status: ["OK", "MARGINAL", "CANCELLED"],
    },
  },
} as const
