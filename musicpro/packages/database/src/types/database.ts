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
          photo_consent: boolean;
          photo_consent_at: string | null;
          is_active: boolean;
          is_enrollment_draft: boolean;
          draft_expires_at: string | null;
          membership_card_picked_up_at: string | null;
          gadgets_picked_up_at: string | null;
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
          photo_consent?: boolean;
          photo_consent_at?: string | null;
          is_active?: boolean;
          is_enrollment_draft?: boolean;
          draft_expires_at?: string | null;
          membership_card_picked_up_at?: string | null;
          gadgets_picked_up_at?: string | null;
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
          signature_required: boolean;
          signed_at: string | null;
          signature_storage_path: string | null;
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
          signature_required?: boolean;
          signed_at?: string | null;
          signature_storage_path?: string | null;
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
          open_minute: number;
          close_minute: number;
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
          open_minute?: number;
          close_minute?: number;
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
          band_id: string | null;
          member_snapshot: Json | null;
          source: "booking" | "calendar" | "lesson";
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
          band_id?: string | null;
          member_snapshot?: Json | null;
          payment_method?: "stripe" | "credits" | null;
          credits_held?: number;
          credits_used?: number | null;
          google_calendar_event_id?: string | null;
          google_calendar_synced_at?: string | null;
          google_calendar_sync_error?: string | null;
          source?: "booking" | "calendar" | "lesson";
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
      bands: {
        Row: {
          id: string;
          name: string;
          founder_member_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          founder_member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["bands"]["Insert"]>;
        Relationships: [];
      };
      band_members: {
        Row: {
          band_id: string;
          member_id: string;
          status: Database["public"]["Enums"]["band_member_status"];
          role: Database["public"]["Enums"]["band_member_role"];
          joined_at: string | null;
          invited_email: string | null;
        };
        Insert: {
          band_id: string;
          member_id: string;
          status?: Database["public"]["Enums"]["band_member_status"];
          role?: Database["public"]["Enums"]["band_member_role"];
          joined_at?: string | null;
          invited_email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["band_members"]["Insert"]>;
        Relationships: [];
      };
      band_invites: {
        Row: {
          id: string;
          band_id: string;
          email: string;
          token: string;
          status: Database["public"]["Enums"]["band_invite_status"];
          expires_at: string;
          invited_by_member_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          band_id: string;
          email: string;
          token?: string;
          status?: Database["public"]["Enums"]["band_invite_status"];
          expires_at: string;
          invited_by_member_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["band_invites"]["Insert"]>;
        Relationships: [];
      };
      quota_payments: {
        Row: {
          id: string;
          paid_by_member_id: string;
          stripe_payment_intent_id: string | null;
          total_amount_eur: number;
          fiscal_year: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          paid_by_member_id: string;
          stripe_payment_intent_id?: string | null;
          total_amount_eur: number;
          fiscal_year: number;
        };
        Update: Partial<Database["public"]["Tables"]["quota_payments"]["Insert"]>;
        Relationships: [];
      };
      quota_payment_items: {
        Row: {
          id: string;
          quota_payment_id: string;
          member_id: string;
          amount_eur: number;
          fiscal_year: number;
          paid_by_member_id: string;
          status: Database["public"]["Enums"]["quota_payment_item_status"];
        };
        Insert: {
          id?: string;
          quota_payment_id: string;
          member_id: string;
          amount_eur: number;
          fiscal_year: number;
          paid_by_member_id: string;
          status?: Database["public"]["Enums"]["quota_payment_item_status"];
        };
        Update: Partial<
          Database["public"]["Tables"]["quota_payment_items"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_subjects: {
        Row: {
          id: string;
          name: string;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["lesson_subjects"]["Insert"]>;
        Relationships: [];
      };
      school_lesson_settings: {
        Row: {
          id: boolean;
          grid_open_minute: number;
          grid_close_minute: number;
          sunday_visible: boolean;
          slot_granularity_minutes: number;
          default_group_capacity: number;
          attendance_edit_days: number;
          hold_hours: number;
          reminder_week_hours: number;
          reminder_day_hours: number;
          reminder_soon_hours: number;
          pack_remind_hours_1: number;
          pack_remind_hours_2: number;
          notula_job_day: number;
          notula_job_hour: number;
          notula_sign_deadline_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          grid_open_minute?: number;
          grid_close_minute?: number;
          sunday_visible?: boolean;
          slot_granularity_minutes?: number;
          default_group_capacity?: number;
          attendance_edit_days?: number;
          hold_hours?: number;
          reminder_week_hours?: number;
          reminder_day_hours?: number;
          reminder_soon_hours?: number;
          pack_remind_hours_1?: number;
          pack_remind_hours_2?: number;
          notula_job_day?: number;
          notula_job_hour?: number;
          notula_sign_deadline_days?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["school_lesson_settings"]["Insert"]
        >;
        Relationships: [];
      };
      school_course_terms: {
        Row: {
          id: string;
          label: string;
          starts_on: string;
          ends_on: string;
          is_current: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          starts_on: string;
          ends_on: string;
          is_current?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["school_course_terms"]["Insert"]>;
        Relationships: [];
      };
      school_closures: {
        Row: {
          id: string;
          starts_on: string;
          ends_on: string;
          title: string;
          repeats_yearly: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          starts_on: string;
          ends_on: string;
          title: string;
          repeats_yearly?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["school_closures"]["Insert"]>;
        Relationships: [];
      };
      course_pack_prices: {
        Row: {
          id: string;
          course_kind: "individuale" | "gruppo" | "online";
          duration_minutes: number;
          amount_eur: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_kind: "individuale" | "gruppo" | "online";
          duration_minutes: number;
          amount_eur?: number | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["course_pack_prices"]["Insert"]
        >;
        Relationships: [];
      };
      pay_rate_types: {
        Row: {
          id: string;
          slug: string;
          label: string;
          unit: "hourly" | "per_head_per_lesson";
          is_system: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          label: string;
          unit: "hourly" | "per_head_per_lesson";
          is_system?: boolean;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["pay_rate_types"]["Insert"]>;
        Relationships: [];
      };
      teacher_profiles: {
        Row: {
          member_id: string;
          can_create_courses: boolean;
          can_reschedule: boolean;
          can_close_courses: boolean;
          payment_visibility: "status" | "amounts" | "hidden";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          member_id: string;
          can_create_courses?: boolean;
          can_reschedule?: boolean;
          can_close_courses?: boolean;
          payment_visibility?: "status" | "amounts" | "hidden";
        };
        Update: Partial<Database["public"]["Tables"]["teacher_profiles"]["Insert"]>;
        Relationships: [];
      };
      teacher_pay_rates: {
        Row: {
          id: string;
          member_id: string;
          pay_rate_type_id: string;
          amount_eur: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          pay_rate_type_id: string;
          amount_eur: number;
        };
        Update: Partial<Database["public"]["Tables"]["teacher_pay_rates"]["Insert"]>;
        Relationships: [];
      };
      teacher_subjects: {
        Row: {
          member_id: string;
          subject_id: string;
        };
        Insert: {
          member_id: string;
          subject_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["teacher_subjects"]["Insert"]>;
        Relationships: [];
      };
      teacher_availability: {
        Row: {
          id: string;
          member_id: string;
          /** ISO weekday: 1=Monday … 7=Sunday */
          day_of_week: number;
          start_minute: number;
          end_minute: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          day_of_week: number;
          start_minute: number;
          end_minute: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["teacher_availability"]["Insert"]
        >;
        Relationships: [];
      };
      teacher_time_off: {
        Row: {
          id: string;
          member_id: string;
          starts_at: string;
          ends_at: string;
          reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          member_id: string;
          starts_at: string;
          ends_at: string;
          reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["teacher_time_off"]["Insert"]>;
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          name: string;
          course_kind: "individuale" | "gruppo" | "online";
          status:
            | "in_attesa"
            | "attivo"
            | "rifiutato"
            | "in_pausa"
            | "chiuso";
          subject_id: string;
          titular_member_id: string;
          room_id: string | null;
          duration_minutes: number;
          weekly_dow: number;
          weekly_start_minute: number;
          starts_on: string;
          term_id: string;
          max_students: number;
          price_eur: number;
          pay_rate_type_id: string | null;
          pay_amount_eur: number | null;
          counts_as_hour: boolean;
          hold_until: string | null;
          hold_booking_id: string | null;
          closed_on: string | null;
          rejected_at: string | null;
          created_by: string | null;
          is_trial: boolean;
          trial_reschedule_used: boolean;
          converted_to_course_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          course_kind: "individuale" | "gruppo" | "online";
          status?:
            | "in_attesa"
            | "attivo"
            | "rifiutato"
            | "in_pausa"
            | "chiuso";
          subject_id: string;
          titular_member_id: string;
          room_id?: string | null;
          duration_minutes: number;
          weekly_dow: number;
          weekly_start_minute: number;
          starts_on: string;
          term_id: string;
          max_students?: number;
          price_eur?: number;
          pay_rate_type_id?: string | null;
          pay_amount_eur?: number | null;
          counts_as_hour?: boolean;
          hold_until?: string | null;
          hold_booking_id?: string | null;
          closed_on?: string | null;
          rejected_at?: string | null;
          created_by?: string | null;
          is_trial?: boolean;
          trial_reschedule_used?: boolean;
          converted_to_course_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["courses"]["Insert"]>;
        Relationships: [];
      };
      course_enrollments: {
        Row: {
          id: string;
          course_id: string;
          member_id: string;
          opening_prepaid_lessons: number;
          left_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          member_id: string;
          opening_prepaid_lessons?: number;
          left_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["course_enrollments"]["Insert"]
        >;
        Relationships: [];
      };
      course_teachers: {
        Row: {
          id: string;
          course_id: string;
          member_id: string;
          role: "titolare" | "coordinatore";
          starts_on: string;
          ends_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          member_id: string;
          role: "titolare" | "coordinatore";
          starts_on: string;
          ends_on?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["course_teachers"]["Insert"]>;
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          course_id: string;
          sequence_number: number;
          starts_at: string | null;
          ends_at: string | null;
          room_id: string | null;
          booking_id: string | null;
          placement: "scheduled" | "da_piazzare" | "da_recuperare";
          cancelled_at: string | null;
          kind: "regular" | "recupero" | "prova";
          recovered_from_lesson_id: string | null;
          makeup_member_id: string | null;
          parked_reason:
            | "giustificato"
            | "cancellata_scuola"
            | "docente_assente"
            | null;
          original_starts_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          sequence_number: number;
          starts_at?: string | null;
          ends_at?: string | null;
          room_id?: string | null;
          booking_id?: string | null;
          placement?: "scheduled" | "da_piazzare" | "da_recuperare";
          cancelled_at?: string | null;
          kind?: "regular" | "recupero" | "prova";
          recovered_from_lesson_id?: string | null;
          makeup_member_id?: string | null;
          parked_reason?:
            | "giustificato"
            | "cancellata_scuola"
            | "docente_assente"
            | null;
          original_starts_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lessons"]["Insert"]>;
        Relationships: [];
      };
      lesson_attendances: {
        Row: {
          id: string;
          lesson_id: string;
          member_id: string;
          status: "presente" | "assente" | "assente_giustificato";
          marked_by: string | null;
          marked_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          member_id: string;
          status: "presente" | "assente" | "assente_giustificato";
          marked_by?: string | null;
          marked_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_attendances"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_family_accounts: {
        Row: {
          family_key: string;
          leftover_eur: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          family_key: string;
          leftover_eur?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_family_accounts"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_fees: {
        Row: {
          id: string;
          course_enrollment_id: string | null;
          member_id: string;
          course_id: string | null;
          kind: "pack" | "quota";
          status: "aperta" | "parziale" | "saldata" | "abbuonata";
          amount_eur: number;
          remaining_eur: number;
          due_on: string;
          last_dunning_at: string | null;
          dunning_count: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_enrollment_id?: string | null;
          member_id: string;
          course_id?: string | null;
          kind: "pack" | "quota";
          status?: "aperta" | "parziale" | "saldata" | "abbuonata";
          amount_eur: number;
          remaining_eur: number;
          due_on: string;
          last_dunning_at?: string | null;
          dunning_count?: number;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["lesson_fees"]["Insert"]>;
        Relationships: [];
      };
      lesson_pack_payments: {
        Row: {
          id: string;
          family_key: string;
          member_id: string;
          amount_eur: number;
          method: "stripe" | "bonifico" | "contanti" | "altro";
          status: "pending" | "completed" | "failed";
          paid_on: string | null;
          note: string | null;
          cro: string | null;
          include_quota: boolean;
          stripe_payment_intent_id: string | null;
          stripe_payment_link_id: string | null;
          stripe_payment_link_url: string | null;
          stripe_event_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          family_key: string;
          member_id: string;
          amount_eur: number;
          method: "stripe" | "bonifico" | "contanti" | "altro";
          status?: "pending" | "completed" | "failed";
          paid_on?: string | null;
          note?: string | null;
          cro?: string | null;
          include_quota?: boolean;
          stripe_payment_intent_id?: string | null;
          stripe_payment_link_id?: string | null;
          stripe_payment_link_url?: string | null;
          stripe_event_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_pack_payments"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_fee_allocations: {
        Row: {
          id: string;
          payment_id: string;
          fee_id: string;
          amount_eur: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          fee_id: string;
          amount_eur: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_fee_allocations"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_credit_ledger: {
        Row: {
          id: string;
          course_enrollment_id: string;
          member_id: string;
          course_id: string;
          delta: number;
          kind:
            | "saldo_iniziale"
            | "pack"
            | "anticipo_famiglia"
            | "consumo"
            | "rettifica"
            | "spostamento_out"
            | "spostamento_in"
            | "abbuono"
            | "rimborso";
          lesson_id: string | null;
          lesson_fee_id: string | null;
          lesson_payment_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          course_enrollment_id: string;
          member_id: string;
          course_id: string;
          delta: number;
          kind:
            | "saldo_iniziale"
            | "pack"
            | "anticipo_famiglia"
            | "consumo"
            | "rettifica"
            | "spostamento_out"
            | "spostamento_in"
            | "abbuono"
            | "rimborso";
          lesson_id?: string | null;
          lesson_fee_id?: string | null;
          lesson_payment_id?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_credit_ledger"]["Insert"]
        >;
        Relationships: [];
      };
      fiscal_receipt_counters: {
        Row: { year: number; next_n: number };
        Insert: { year: number; next_n?: number };
        Update: Partial<
          Database["public"]["Tables"]["fiscal_receipt_counters"]["Insert"]
        >;
        Relationships: [];
      };
      fiscal_receipts: {
        Row: {
          id: string;
          number_n: number;
          year: number;
          code: string;
          issued_on: string;
          status: "emessa" | "sostituita";
          replaces_id: string | null;
          payment_id: string | null;
          member_id: string;
          payee_name: string;
          payee_tax_code: string | null;
          payee_email: string | null;
          amount_eur: number;
          method: string;
          pdf_base64: string | null;
          emailed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          number_n: number;
          year: number;
          code: string;
          issued_on: string;
          status?: "emessa" | "sostituita";
          replaces_id?: string | null;
          payment_id?: string | null;
          member_id: string;
          payee_name: string;
          payee_tax_code?: string | null;
          payee_email?: string | null;
          amount_eur: number;
          method: string;
          pdf_base64?: string | null;
          emailed_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["fiscal_receipts"]["Insert"]
        >;
        Relationships: [];
      };
      fiscal_receipt_lines: {
        Row: {
          id: string;
          receipt_id: string;
          description: string;
          amount_eur: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          receipt_id: string;
          description: string;
          amount_eur: number;
          sort_order?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["fiscal_receipt_lines"]["Insert"]
        >;
        Relationships: [];
      };
      teacher_cash_advances: {
        Row: {
          id: string;
          teacher_member_id: string;
          payment_id: string | null;
          enrollment_id: string | null;
          amount_eur: number;
          status: "pending" | "confirmed" | "rejected";
          note: string | null;
          confirmed_by: string | null;
          confirmed_at: string | null;
          payroll_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_member_id: string;
          payment_id?: string | null;
          enrollment_id?: string | null;
          amount_eur: number;
          status?: "pending" | "confirmed" | "rejected";
          note?: string | null;
          confirmed_by?: string | null;
          confirmed_at?: string | null;
          payroll_id?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["teacher_cash_advances"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_payrolls: {
        Row: {
          id: string;
          teacher_member_id: string;
          year: number;
          month: number;
          status: "draft" | "signed" | "closed";
          gross_eur: number;
          advances_eur: number;
          carry_in_eur: number;
          carry_out_eur: number;
          withholding_eur: number;
          net_eur: number;
          minutes_teaching: number;
          minutes_coordination: number;
          signed_at: string | null;
          signature_png_base64: string | null;
          invoice_filename: string | null;
          invoice_base64: string | null;
          invoice_uploaded_at: string | null;
          closed_at: string | null;
          closed_by: string | null;
          paid_on: string | null;
          paid_method: string | null;
          paid_note: string | null;
          generated_at: string;
          generated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_member_id: string;
          year: number;
          month: number;
          status?: "draft" | "signed" | "closed";
          gross_eur?: number;
          advances_eur?: number;
          carry_in_eur?: number;
          carry_out_eur?: number;
          withholding_eur?: number;
          net_eur?: number;
          minutes_teaching?: number;
          minutes_coordination?: number;
          signed_at?: string | null;
          signature_png_base64?: string | null;
          invoice_filename?: string | null;
          invoice_base64?: string | null;
          invoice_uploaded_at?: string | null;
          closed_at?: string | null;
          closed_by?: string | null;
          paid_on?: string | null;
          paid_method?: string | null;
          paid_note?: string | null;
          generated_at?: string;
          generated_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_payrolls"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_payroll_lines: {
        Row: {
          id: string;
          payroll_id: string;
          kind:
            | "insegnamento"
            | "coordinamento"
            | "extra"
            | "anticipo"
            | "riporto";
          lesson_id: string | null;
          course_id: string | null;
          occurred_on: string | null;
          description: string;
          minutes: number;
          quantity: number;
          unit_eur: number;
          amount_eur: number;
          sort_order: number;
          is_manual: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          payroll_id: string;
          kind:
            | "insegnamento"
            | "coordinamento"
            | "extra"
            | "anticipo"
            | "riporto";
          lesson_id?: string | null;
          course_id?: string | null;
          occurred_on?: string | null;
          description: string;
          minutes?: number;
          quantity?: number;
          unit_eur?: number;
          amount_eur?: number;
          sort_order?: number;
          is_manual?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_payroll_lines"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_payroll_slips: {
        Row: {
          lesson_id: string;
          from_year: number;
          from_month: number;
          to_year: number;
          to_month: number;
          slipped_at: string;
        };
        Insert: {
          lesson_id: string;
          from_year: number;
          from_month: number;
          to_year: number;
          to_month: number;
          slipped_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_payroll_slips"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_reminder_log: {
        Row: {
          id: string;
          lesson_id: string;
          kind: "day" | "soon";
          sent_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          kind: "day" | "soon";
          sent_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_reminder_log"]["Insert"]
        >;
        Relationships: [];
      };
      lesson_change_requests: {
        Row: {
          id: string;
          lesson_id: string;
          course_id: string;
          requested_starts_at: string;
          requested_room_id: string | null;
          scope: "this" | "future";
          note: string | null;
          status: "pending" | "approved" | "rejected";
          hold_booking_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          course_id: string;
          requested_starts_at: string;
          requested_room_id?: string | null;
          scope?: "this" | "future";
          note?: string | null;
          status?: "pending" | "approved" | "rejected";
          hold_booking_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["lesson_change_requests"]["Insert"]
        >;
        Relationships: [];
      };
      course_lifecycle_events: {
        Row: {
          id: string;
          course_id: string;
          enrollment_id: string | null;
          kind:
            | "pause"
            | "resume"
            | "close"
            | "remove_enrollment"
            | "close_request"
            | "undo";
          payload: Json;
          created_by: string | null;
          created_at: string;
          undo_until: string | null;
          undone_at: string | null;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          course_id: string;
          enrollment_id?: string | null;
          kind:
            | "pause"
            | "resume"
            | "close"
            | "remove_enrollment"
            | "close_request"
            | "undo";
          payload?: Json;
          created_by?: string | null;
          undo_until?: string | null;
          undone_at?: string | null;
          resolved_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["course_lifecycle_events"]["Insert"]
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
          p_band_id?: string | null;
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
      member_quota_ok: {
        Args: {
          p_member_id: string;
          p_fiscal_year?: number;
        };
        Returns: boolean;
      };
      current_member_id: {
        Args: Record<string, never>;
        Returns: string | null;
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
      create_band_safe: {
        Args: {
          p_name: string;
        };
        Returns: Json;
      };
      accept_band_invite: {
        Args: {
          p_token: string;
        };
        Returns: Json;
      };
      band_all_members_quota_ok: {
        Args: {
          p_band_id: string;
          p_fiscal_year?: number | null;
        };
        Returns: boolean;
      };
      list_my_bands: {
        Args: Record<string, never>;
        Returns: Json;
      };
      create_quota_payment_checkout: {
        Args: {
          p_member_ids: string[];
          p_fiscal_year?: number | null;
        };
        Returns: Json;
      };
      lesson_family_key: {
        Args: { p_member_id: string };
        Returns: string;
      };
      sync_lesson_wallet_after_attendance: {
        Args: { p_lesson_id: string };
        Returns: Json;
      };
      apply_lesson_pack_payment: {
        Args: { p_payment_id: string };
        Returns: Json;
      };
      next_fiscal_receipt_number: {
        Args: { p_year: number };
        Returns: number;
      };
      apply_stripe_lesson_pack_payment: {
        Args: {
          p_stripe_event_id: string;
          p_stripe_event_type: string;
          p_payment_intent_id: string;
          p_payment_link_id: string;
          p_amount_cents: number;
          p_payment_id: string;
        };
        Returns: Json;
      };
      apply_stripe_quota_payment: {
        Args: {
          p_stripe_event_id: string;
          p_stripe_event_type: string;
          p_payment_intent_id: string;
          p_payment_link_id: string;
          p_amount_cents: number;
          p_flow: string;
          p_enrollment_id?: string | null;
          p_quota_payment_id?: string | null;
        };
        Returns: Json;
      };
      create_lesson_booking: {
        Args: {
          p_room_id: string;
          p_member_id: string;
          p_start_at: string;
          p_end_at: string;
          p_title: string;
        };
        Returns: Json;
      };
      cancel_lesson_booking: {
        Args: {
          p_booking_id: string;
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
      band_member_status:
        | "pending_invite"
        | "pending_quota"
        | "active"
        | "expired";
      band_member_role: "founder" | "member";
      band_invite_status: "pending" | "accepted" | "expired" | "revoked";
      quota_payment_item_status:
        | "pending"
        | "completed"
        | "failed"
        | "refunded";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
