import type { SupabaseClient } from "@supabase/supabase-js";

import { getBookingSettings, type BookingSettings } from "./bookings";
import type { Database } from "./types/database";

type SettingsClient = SupabaseClient<Database>;

export type { BookingSettings };

export interface BookingSettingsInput {
  autoConfirmMinHours: number;
  approvalMinHours: number;
  cancelMinHours: number;
  modifyMinHours: number;
  bandRequired: boolean;
  locked: boolean;
  lockedMessage: string;
}

export interface SettingsMutationResult {
  success: boolean;
  errorMessage?: string;
}

export interface AppSetting {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

/** GAS legacy document / Drive / storage / email settings (not booking thresholds). */
export const DOCUMENT_SETTING_KEYS = [
  "root_reimbursements_folder_id",
  "reimbursement_template_id",
  "enrollment_template_id",
  "root_enrollments_folder_id",
  "admin_email",
  "segreteria_email",
  "storage_bucket_reimbursements",
  "storage_bucket_enrollments",
  "legacy_spreadsheet_id",
  "timezone",
] as const;

export type DocumentSettingKey = (typeof DOCUMENT_SETTING_KEYS)[number];

export const DOCUMENT_SETTING_LABELS: Record<DocumentSettingKey, string> = {
  root_reimbursements_folder_id: "Cartella Drive notule (legacy)",
  reimbursement_template_id: "Template Google Doc notule (legacy)",
  enrollment_template_id: "Template iscrizione (legacy)",
  root_enrollments_folder_id: "Cartella Drive iscrizioni (legacy)",
  admin_email: "Email admin",
  segreteria_email: "Email segreteria",
  storage_bucket_reimbursements: "Bucket Storage notule",
  storage_bucket_enrollments: "Bucket Storage iscrizioni",
  legacy_spreadsheet_id: "ID foglio Google legacy",
  timezone: "Fuso orario",
};

const BOOKING_SETTING_KEYS = {
  autoConfirmMinHours: "booking_auto_confirm_min_hours",
  approvalMinHours: "booking_approval_min_hours",
  cancelMinHours: "booking_cancel_min_hours",
  modifyMinHours: "booking_modify_min_hours",
  bandRequired: "booking_band_required",
  locked: "booking_locked",
  lockedMessage: "booking_locked_message",
} as const;

export async function getAppBookingSettings(
  client: SettingsClient,
): Promise<BookingSettings> {
  return getBookingSettings(client);
}

export async function updateBookingSettings(
  client: SettingsClient,
  input: BookingSettingsInput,
): Promise<SettingsMutationResult> {
  if (
    input.autoConfirmMinHours <= 0 ||
    input.approvalMinHours <= 0 ||
    input.cancelMinHours <= 0 ||
    input.modifyMinHours <= 0
  ) {
    return {
      success: false,
      errorMessage: "Le soglie devono essere maggiori di zero.",
    };
  }

  if (input.approvalMinHours >= input.autoConfirmMinHours) {
    return {
      success: false,
      errorMessage:
        "La soglia di approvazione deve essere inferiore alla conferma automatica.",
    };
  }

  const rows = [
    {
      key: BOOKING_SETTING_KEYS.autoConfirmMinHours,
      value: String(input.autoConfirmMinHours),
    },
    {
      key: BOOKING_SETTING_KEYS.approvalMinHours,
      value: String(input.approvalMinHours),
    },
    {
      key: BOOKING_SETTING_KEYS.cancelMinHours,
      value: String(input.cancelMinHours),
    },
    {
      key: BOOKING_SETTING_KEYS.modifyMinHours,
      value: String(input.modifyMinHours),
    },
    {
      key: BOOKING_SETTING_KEYS.bandRequired,
      value: input.bandRequired ? "true" : "false",
      description:
        "Band obbligatoria per prenotazioni (salvo PROVI DA SOLO). Se disattivato, l'associato in regola con la quota può prenotare da solo.",
    },
    {
      key: BOOKING_SETTING_KEYS.locked,
      value: input.locked ? "true" : "false",
      description:
        "Se true, gli associati non possono creare prenotazioni. Staff (admin/segreteria) può comunque prenotare.",
    },
    {
      key: BOOKING_SETTING_KEYS.lockedMessage,
      value: input.lockedMessage.trim(),
      description:
        "Messaggio mostrato agli associati quando le prenotazioni sono chiuse.",
    },
  ];

  const { error } = await client.from("app_settings").upsert(rows, {
    onConflict: "key",
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare le impostazioni.",
    };
  }

  return { success: true };
}

export async function getAppSettingValue(
  client: SettingsClient,
  key: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile leggere l'impostazione ${key}: ${error.message}`);
  }

  const value = typeof data?.value === "string" ? data.value.trim() : "";
  return value || null;
}

export async function listAppSettings(
  client: SettingsClient,
  keys?: readonly string[],
): Promise<AppSetting[]> {
  let query = client
    .from("app_settings")
    .select("key, value, description, updated_at")
    .order("key", { ascending: true });

  if (keys && keys.length > 0) {
    query = query.in("key", [...keys]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare le impostazioni: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}

export async function listDocumentSettings(
  client: SettingsClient,
): Promise<AppSetting[]> {
  const settings = await listAppSettings(client, DOCUMENT_SETTING_KEYS);
  const byKey = new Map(settings.map((s) => [s.key, s]));

  // Ensure all known keys appear (even if missing from DB).
  return DOCUMENT_SETTING_KEYS.map((key) => {
    const existing = byKey.get(key);
    if (existing) return existing;
    return {
      key,
      value: "",
      description: DOCUMENT_SETTING_LABELS[key],
      updatedAt: "",
    };
  });
}

export async function upsertAppSetting(
  client: SettingsClient,
  key: string,
  value: string,
  description?: string | null,
): Promise<SettingsMutationResult> {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    return { success: false, errorMessage: "Chiave impostazione mancante." };
  }

  const row: {
    key: string;
    value: string;
    description?: string | null;
  } = {
    key: trimmedKey,
    value: value.trim(),
  };

  if (description !== undefined) {
    row.description = description;
  }

  const { error } = await client.from("app_settings").upsert(row, {
    onConflict: "key",
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare l'impostazione.",
    };
  }

  return { success: true };
}

export async function upsertDocumentSettings(
  client: SettingsClient,
  updates: Record<string, string>,
): Promise<SettingsMutationResult> {
  const allowed = new Set<string>(DOCUMENT_SETTING_KEYS);
  const rows = Object.entries(updates)
    .filter(([key]) => allowed.has(key))
    .map(([key, value]) => ({
      key,
      value: value.trim(),
      description: DOCUMENT_SETTING_LABELS[key as DocumentSettingKey] ?? null,
    }));

  if (rows.length === 0) {
    return {
      success: false,
      errorMessage: "Nessuna impostazione documento da salvare.",
    };
  }

  const { error } = await client.from("app_settings").upsert(rows, {
    onConflict: "key",
  });

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare le impostazioni.",
    };
  }

  return { success: true };
}
