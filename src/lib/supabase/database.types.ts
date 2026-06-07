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
      flights: {
        Row: {
          actual_departure_time: string | null
          created_at: string
          estimated_departure_time: string | null
          flight_number: number
          id: string
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
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
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
      participants: {
        Row: {
          assigned_instructor_id: string | null
          check_in_completed: boolean
          created_at: string
          email: string | null
          flight_id: string | null
          full_name: string
          geared_up: boolean
          id: string
          notes: string | null
          operational_status: Database["public"]["Enums"]["operational_status"]
          overweight_fee: number
          package_type: Database["public"]["Enums"]["package_type"]
          phone: string | null
          reservation_group_id: string | null
          updated_at: string
          waiver_signed: boolean
          weight: number | null
        }
        Insert: {
          assigned_instructor_id?: string | null
          check_in_completed?: boolean
          created_at?: string
          email?: string | null
          flight_id?: string | null
          full_name: string
          geared_up?: boolean
          id?: string
          notes?: string | null
          operational_status?: Database["public"]["Enums"]["operational_status"]
          overweight_fee?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          phone?: string | null
          reservation_group_id?: string | null
          updated_at?: string
          waiver_signed?: boolean
          weight?: number | null
        }
        Update: {
          assigned_instructor_id?: string | null
          check_in_completed?: boolean
          created_at?: string
          email?: string | null
          flight_id?: string | null
          full_name?: string
          geared_up?: boolean
          id?: string
          notes?: string | null
          operational_status?: Database["public"]["Enums"]["operational_status"]
          overweight_fee?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          phone?: string | null
          reservation_group_id?: string | null
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
      reservation_groups: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          payer_name: string | null
          source: Database["public"]["Enums"]["reservation_source"]
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          payer_name?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          payer_name?: string | null
          source?: Database["public"]["Enums"]["reservation_source"]
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
      [_ in never]: never
    }
    Enums: {
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
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
      reservation_source: ["DIRECT", "GROUPON", "BONO", "PROMO", "SMARTBOX"],
      weather_status: ["OK", "MARGINAL", "CANCELLED"],
    },
  },
} as const
