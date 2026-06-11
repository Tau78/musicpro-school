/**
 * Placeholder for Supabase generated types.
 * Regenerate with: npx supabase gen types typescript --project-id <id> > packages/database/src/types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type MemberRoleEnum =
  | "admin"
  | "docente"
  | "associato"
  | "segreteria"
  | "social"
  | "tutore";

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      members: {
        Row: {
          id: string;
          user_id: string | null;
          member_number: number | null;
          enrolled_at: string | null;
          first_name: string;
          last_name: string;
          birth_place: string | null;
          birth_province: string | null;
          birth_date: string | null;
          address_street: string | null;
          address_postal_code: string | null;
          address_city: string | null;
          address_province: string | null;
          tax_code: string | null;
          phone: string | null;
          email: string | null;
          legacy_tutor_member_number: number | null;
          legacy_tutor_full_name: string | null;
          manual_tutor_first_name: string | null;
          manual_tutor_last_name: string | null;
          manual_tutor_phone: string | null;
          manual_tutor_email: string | null;
          manual_tutor_tax_code: string | null;
          telegram_chat_id: string | null;
          gdpr_consent: boolean;
          gdpr_consent_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          member_number?: number | null;
          enrolled_at?: string | null;
          first_name: string;
          last_name: string;
          birth_place?: string | null;
          birth_province?: string | null;
          birth_date?: string | null;
          address_street?: string | null;
          address_postal_code?: string | null;
          address_city?: string | null;
          address_province?: string | null;
          tax_code?: string | null;
          phone?: string | null;
          email?: string | null;
          legacy_tutor_member_number?: number | null;
          legacy_tutor_full_name?: string | null;
          manual_tutor_first_name?: string | null;
          manual_tutor_last_name?: string | null;
          manual_tutor_phone?: string | null;
          manual_tutor_email?: string | null;
          manual_tutor_tax_code?: string | null;
          telegram_chat_id?: string | null;
          gdpr_consent?: boolean;
          gdpr_consent_at?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["members"]["Insert"]>;
        Relationships: [];
      };
      member_roles: {
        Row: {
          id: string;
          member_id: string;
          role: MemberRoleEnum;
          granted_at: string;
          granted_by: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          member_id: string;
          role: MemberRoleEnum;
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          member_id?: string;
          role?: MemberRoleEnum;
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      reimbursements: {
        Row: {
          id: string;
          member_id: string;
          created_by_member_id: string | null;
          fiscal_year: number;
          generated_at: string;
          progressive: string;
          gross_amount_eur: number;
          withholding_eur: number | null;
          net_amount_eur: number | null;
          payment_method: string | null;
          payment_date: string | null;
          receipts_amount_eur: number | null;
          receipts_notes: string | null;
          receipts_status: "mancante" | "parziale" | "completo";
          pdf_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          created_by_member_id?: string | null;
          fiscal_year: number;
          generated_at?: string;
          progressive: string;
          gross_amount_eur: number;
          withholding_eur?: number | null;
          net_amount_eur?: number | null;
          payment_method?: string | null;
          payment_date?: string | null;
          receipts_amount_eur?: number | null;
          receipts_notes?: string | null;
          pdf_url?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["reimbursements"]["Insert"]> & {
          receipts_status?: "mancante" | "parziale" | "completo";
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          capacity: number | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          capacity?: number | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          room_id: string;
          member_id: string;
          start_at: string;
          end_at: string;
          status: "pending" | "confirmed" | "cancelled";
          title: string | null;
          notes: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          member_id: string;
          start_at: string;
          end_at: string;
          status?: "pending" | "confirmed" | "cancelled";
          title?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]> & {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Relationships: [];
      };
      enrollments: {
        Row: {
          id: string;
          legacy_enrollment_id: string | null;
          member_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          tax_code: string | null;
          phone: string | null;
          fiscal_year: number;
          amount_centesimi: number;
          payment_status: string;
          payment_link_url: string | null;
          payment_link_id: string | null;
          payment_total_centesimi: number | null;
          stripe_gross_centesimi: number | null;
          stripe_fee_centesimi: number | null;
          stripe_net_centesimi: number | null;
          stripe_payment_intent_id: string | null;
          paid_at: string | null;
          created_at: string;
          form_payload: Json | null;
          pdf_url: string | null;
          pdf_storage_path: string | null;
          confirmation_email_sent: boolean;
          confirmation_email_sent_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legacy_enrollment_id?: string | null;
          member_id?: string | null;
          first_name: string;
          last_name: string;
          email: string;
          tax_code?: string | null;
          phone?: string | null;
          fiscal_year: number;
          amount_centesimi: number;
          payment_status?: string;
          payment_link_url?: string | null;
          payment_link_id?: string | null;
          payment_total_centesimi?: number | null;
          form_payload?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["enrollments"]["Insert"]> & {
          stripe_gross_centesimi?: number | null;
          stripe_fee_centesimi?: number | null;
          stripe_net_centesimi?: number | null;
          stripe_payment_intent_id?: string | null;
          paid_at?: string | null;
          pdf_url?: string | null;
          confirmation_email_sent?: boolean;
          confirmation_email_sent_at?: string | null;
        };
        Relationships: [];
      };
      member_annual_quotas: {
        Row: {
          id: string;
          member_id: string;
          fiscal_year: number;
          paid_at: string | null;
          amount_paid_eur: number | null;
          amount_due_eur: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          fiscal_year: number;
          paid_at?: string | null;
          amount_paid_eur?: number | null;
          amount_due_eur?: number | null;
          notes?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["member_annual_quotas"]["Insert"]
        >;
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: string;
          description: string | null;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          description?: string | null;
          updated_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["app_settings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ensure_member_linked: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      create_booking_safe: {
        Args: {
          p_room_id: string;
          p_member_id: string;
          p_start_at: string;
          p_end_at: string;
        };
        Returns: Json;
      };
    };
    Enums: {
      member_role: MemberRoleEnum;
      booking_status: "pending" | "confirmed" | "cancelled";
      campaign_status: "draft" | "scheduled" | "sent" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
