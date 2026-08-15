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
          pdf_storage_path: string | null;
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
          pdf_storage_path?: string | null;
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
          hourly_rate_eur: number;
          slot_granularity_minutes: number;
          default_duration_minutes: number;
          min_duration_minutes: number;
          max_duration_minutes: number;
          open_hour: number;
          close_hour: number;
          google_calendar_color_id: string | null;
          provi_da_solo_enabled: boolean;
          provi_da_solo_discount_eur: number;
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
          hourly_rate_eur?: number;
          slot_granularity_minutes?: number;
          default_duration_minutes?: number;
          min_duration_minutes?: number;
          max_duration_minutes?: number;
          open_hour?: number;
          close_hour?: number;
          google_calendar_color_id?: string | null;
          provi_da_solo_enabled?: boolean;
          provi_da_solo_discount_eur?: number;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
        Relationships: [];
      };
      room_provi_da_solo_schedule: {
        Row: {
          id: string;
          room_id: string;
          day_of_week: number;
          start_minute: number;
          end_minute: number;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          day_of_week: number;
          start_minute: number;
          end_minute: number;
          enabled?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["room_provi_da_solo_schedule"]["Insert"]
        >;
        Relationships: [];
      };
      bookings: {
        Row: {
          id: string;
          room_id: string;
          member_id: string;
          start_at: string;
          end_at: string;
          status:
            | "pending"
            | "pending_approval"
            | "confirmed"
            | "cancelled";
          total_price_eur: number | null;
          duration_minutes: number | null;
          payment_status:
            | "unpaid"
            | "link_sent"
            | "paid"
            | "not_required";
          payment_link_url: string | null;
          payment_link_id: string | null;
          stripe_payment_intent_id: string | null;
          paid_at: string | null;
          title: string | null;
          notes: string | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          payment_method: "stripe" | "credits" | null;
          credits_held: number;
          credits_used: number | null;
          google_calendar_event_id: string | null;
          google_calendar_synced_at: string | null;
          google_calendar_sync_error: string | null;
          provi_da_solo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          member_id: string;
          start_at: string;
          end_at: string;
          status?:
            | "pending"
            | "pending_approval"
            | "confirmed"
            | "cancelled";
          total_price_eur?: number | null;
          duration_minutes?: number | null;
          payment_status?:
            | "unpaid"
            | "link_sent"
            | "paid"
            | "not_required";
          payment_link_url?: string | null;
          payment_link_id?: string | null;
          stripe_payment_intent_id?: string | null;
          paid_at?: string | null;
          title?: string | null;
          notes?: string | null;
          provi_da_solo?: boolean;
          payment_method?: "stripe" | "credits" | null;
          credits_held?: number;
          credits_used?: number | null;
          google_calendar_event_id?: string | null;
          google_calendar_synced_at?: string | null;
          google_calendar_sync_error?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]> & {
          cancelled_at?: string | null;
          cancelled_by?: string | null;
        };
        Relationships: [];
      };
      booking_email_log: {
        Row: {
          id: string;
          booking_id: string;
          recipient_email: string;
          subject: string;
          status: "sent" | "failed" | "skipped";
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          recipient_email: string;
          subject: string;
          status: "sent" | "failed" | "skipped";
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          recipient_email?: string;
          subject?: string;
          status?: "sent" | "failed" | "skipped";
          error?: string | null;
          created_at?: string;
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
      annual_quota_settings: {
        Row: {
          id: string;
          fiscal_year: number;
          amount_eur: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          fiscal_year: number;
          amount_eur: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["annual_quota_settings"]["Insert"]
        >;
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
      room_external_calendars: {
        Row: {
          id: string;
          room_id: string;
          name: string;
          google_calendar_id: string;
          enabled: boolean;
          last_synced_at: string | null;
          last_sync_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          name: string;
          google_calendar_id: string;
          enabled?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["room_external_calendars"]["Insert"]
        > & {
          last_synced_at?: string | null;
          last_sync_error?: string | null;
        };
        Relationships: [];
      };
      external_calendar_events: {
        Row: {
          id: string;
          external_calendar_id: string;
          external_event_id: string;
          start_at: string;
          end_at: string;
          summary: string | null;
          imported_at: string;
        };
        Insert: {
          id?: string;
          external_calendar_id: string;
          external_event_id: string;
          start_at: string;
          end_at: string;
          summary?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["external_calendar_events"]["Insert"]
        >;
        Relationships: [];
      };
      booking_audit_log: {
        Row: {
          id: string;
          booking_id: string;
          actor_member_id: string | null;
          action: string;
          changes: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          actor_member_id?: string | null;
          action: string;
          changes?: Json | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["booking_audit_log"]["Insert"]
        >;
        Relationships: [];
      };
      cancellation_penalty_rules: {
        Row: {
          id: string;
          from_hours: number;
          to_hours: number;
          penalty_percent: number;
          enabled: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          from_hours: number;
          to_hours: number;
          penalty_percent: number;
          enabled?: boolean;
          sort_order?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["cancellation_penalty_rules"]["Insert"]
        >;
        Relationships: [];
      };
      credit_packages: {
        Row: {
          id: string;
          name: string;
          credits: number;
          price_eur: number;
          enabled: boolean;
          sort_order: number;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          credits: number;
          price_eur: number;
          enabled?: boolean;
          sort_order?: number;
          description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["credit_packages"]["Insert"]>;
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          member_id: string;
          amount: number;
          type: Database["public"]["Enums"]["credit_transaction_type"];
          booking_id: string | null;
          purchase_id: string | null;
          reason: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          amount: number;
          type: Database["public"]["Enums"]["credit_transaction_type"];
          booking_id?: string | null;
          purchase_id?: string | null;
          reason?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["credit_transactions"]["Insert"]
        >;
        Relationships: [];
      };
      credit_purchases: {
        Row: {
          id: string;
          member_id: string;
          package_id: string;
          credits_granted: number;
          amount_paid_eur: number;
          stripe_payment_intent_id: string | null;
          stripe_event_id: string | null;
          payment_link_id: string | null;
          payment_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          package_id: string;
          credits_granted: number;
          amount_paid_eur: number;
          stripe_payment_intent_id?: string | null;
          stripe_event_id?: string | null;
          payment_link_id?: string | null;
          payment_status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credit_purchases"]["Insert"]>;
        Relationships: [];
      };
      message_templates: {
        Row: {
          id: string;
          name: string;
          subject: string;
          body: string;
          channel: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          subject: string;
          body: string;
          channel?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["message_templates"]["Insert"]>;
        Relationships: [];
      };
      message_campaigns: {
        Row: {
          id: string;
          template_id: string | null;
          name: string;
          subject: string;
          body: string;
          audiences: Database["public"]["Enums"]["campaign_audience"][];
          audience_filter: Json;
          status: Database["public"]["Enums"]["campaign_status"];
          scheduled_at: string | null;
          sent_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          template_id?: string | null;
          name: string;
          subject: string;
          body: string;
          audiences?: Database["public"]["Enums"]["campaign_audience"][];
          audience_filter?: Json;
          status?: Database["public"]["Enums"]["campaign_status"];
          scheduled_at?: string | null;
          sent_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["message_campaigns"]["Insert"]>;
        Relationships: [];
      };
      message_campaign_recipients: {
        Row: {
          id: string;
          campaign_id: string;
          member_id: string;
          email: string | null;
          telegram_chat_id: string | null;
          sent_at: string | null;
          delivered_at: string | null;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          member_id: string;
          email?: string | null;
          telegram_chat_id?: string | null;
          sent_at?: string | null;
          delivered_at?: string | null;
          error_message?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["message_campaign_recipients"]["Insert"]
        >;
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
          p_provi_da_solo?: boolean;
        };
        Returns: Json;
      };
      cancel_booking_safe: {
        Args: {
          p_booking_id: string;
        };
        Returns: Json;
      };
      review_booking_safe: {
        Args: {
          p_booking_id: string;
          p_action: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      apply_stripe_room_booking_payment: {
        Args: {
          p_booking_ref: string;
          p_stripe_event_id?: string | null;
          p_stripe_event_type?: string | null;
          p_payment_intent_id?: string | null;
          p_payment_link_id?: string | null;
          p_amount_cents?: number | null;
        };
        Returns: Json;
      };
      get_member_credit_balance: {
        Args: {
          p_member_id: string;
        };
        Returns: Json;
      };
      hold_booking_credits: {
        Args: {
          p_booking_id: string;
          p_credits: number;
        };
        Returns: Json;
      };
      debit_booking_credits: {
        Args: {
          p_booking_id: string;
          p_credits?: number | null;
        };
        Returns: Json;
      };
      list_active_credit_packages: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_adjust_member_credits: {
        Args: {
          p_member_id: string;
          p_amount: number;
          p_reason: string;
        };
        Returns: Json;
      };
      apply_stripe_credit_shop_payment: {
        Args: {
          p_purchase_ref: string;
          p_stripe_event_id?: string | null;
          p_stripe_event_type?: string | null;
          p_payment_intent_id?: string | null;
          p_payment_link_id?: string | null;
          p_amount_cents?: number | null;
        };
        Returns: Json;
      };
      admin_update_booking_safe: {
        Args: {
          p_booking_id: string;
          p_room_id: string;
          p_start_at: string;
          p_end_at: string;
          p_duration_minutes: number;
          p_notes?: string | null;
          p_settlement_method?: string | null;
        };
        Returns: Json;
      };
      mark_external_calendar_sync: {
        Args: {
          p_calendar_id: string;
          p_error?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      member_role: MemberRoleEnum;
      booking_status:
        | "pending"
        | "pending_approval"
        | "confirmed"
        | "cancelled";
      campaign_status:
        | "draft"
        | "scheduled"
        | "sending"
        | "sent"
        | "cancelled";
      campaign_audience: "associati" | "docenti" | "room_users" | "tutors";
      credit_transaction_type:
        | "purchase"
        | "debit"
        | "hold"
        | "release"
        | "refund"
        | "adjustment"
        | "penalty";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
