import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type QuotasClient = SupabaseClient<Database>;

export interface AnnualQuotaSetting {
  id: string;
  fiscalYear: number;
  amountEur: number;
  createdAt: string;
  updatedAt: string;
}

export type AnnualQuotaSettingInput = {
  fiscalYear: number;
  amountEur: number;
};

export interface MemberAnnualQuota {
  id: string;
  memberId: string;
  fiscalYear: number;
  paidAt: string | null;
  amountPaidEur: number | null;
  amountDueEur: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MemberAnnualQuotaInput = {
  memberId: string;
  fiscalYear: number;
  paidAt: string;
  amountPaidEur?: number | null;
  amountDueEur?: number | null;
  notes?: string | null;
};

export interface QuotaMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

export interface BulkQuotaUpsertResult {
  success: boolean;
  upsertedCount?: number;
  errorMessage?: string;
}

type SettingRow = {
  id: string;
  fiscal_year: number;
  amount_eur: number;
  created_at: string;
  updated_at: string;
};

type QuotaRow = {
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

const SETTING_COLUMNS =
  "id, fiscal_year, amount_eur, created_at, updated_at";

const QUOTA_COLUMNS =
  "id, member_id, fiscal_year, paid_at, amount_paid_eur, amount_due_eur, notes, created_at, updated_at";

function mapSetting(row: SettingRow): AnnualQuotaSetting {
  return {
    id: row.id,
    fiscalYear: row.fiscal_year,
    amountEur: Number(row.amount_eur),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuota(row: QuotaRow): MemberAnnualQuota {
  return {
    id: row.id,
    memberId: row.member_id,
    fiscalYear: row.fiscal_year,
    paidAt: row.paid_at,
    amountPaidEur:
      row.amount_paid_eur == null ? null : Number(row.amount_paid_eur),
    amountDueEur:
      row.amount_due_eur == null ? null : Number(row.amount_due_eur),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateSettingInput(input: AnnualQuotaSettingInput): string | null {
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 2000) {
    return "Anno fiscale non valido.";
  }
  if (!Number.isFinite(input.amountEur) || input.amountEur < 0) {
    return "Importo non valido.";
  }
  return null;
}

function paidAtToIso(paidAt: string): string {
  if (paidAt.includes("T")) {
    return paidAt;
  }
  return `${paidAt}T12:00:00.000Z`;
}

export function currentFiscalYear(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  return year ? Number(year) : new Date().getFullYear();
}

export function formatQuotaEuro(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatQuotaDateItalian(isoDate: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDate));
}

export async function listAnnualQuotaSettings(
  client: QuotasClient,
): Promise<AnnualQuotaSetting[]> {
  const { data, error } = await client
    .from("annual_quota_settings")
    .select(SETTING_COLUMNS)
    .order("fiscal_year", { ascending: false });

  if (error) {
    throw new Error(
      `Impossibile caricare le impostazioni quote: ${error.message}`,
    );
  }

  return (data ?? []).map((row) => mapSetting(row as SettingRow));
}

export async function createAnnualQuotaSetting(
  client: QuotasClient,
  input: AnnualQuotaSettingInput,
): Promise<QuotaMutationResult> {
  const validationError = validateSettingInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { data, error } = await client
    .from("annual_quota_settings")
    .insert({
      fiscal_year: input.fiscalYear,
      amount_eur: input.amountEur,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        errorMessage: `Esiste già un importo per l'anno ${input.fiscalYear}.`,
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare l'impostazione.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateAnnualQuotaSetting(
  client: QuotasClient,
  settingId: string,
  input: AnnualQuotaSettingInput,
): Promise<QuotaMutationResult> {
  const validationError = validateSettingInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { error } = await client
    .from("annual_quota_settings")
    .update({
      fiscal_year: input.fiscalYear,
      amount_eur: input.amountEur,
    })
    .eq("id", settingId);

  if (error) {
    if (error.code === "23505") {
      return {
        success: false,
        errorMessage: `Esiste già un importo per l'anno ${input.fiscalYear}.`,
      };
    }
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare l'impostazione.",
    };
  }

  return { success: true, id: settingId };
}

export async function deleteAnnualQuotaSetting(
  client: QuotasClient,
  settingId: string,
): Promise<QuotaMutationResult> {
  const { error } = await client
    .from("annual_quota_settings")
    .delete()
    .eq("id", settingId);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare l'impostazione.",
    };
  }

  return { success: true };
}

export async function listMemberAnnualQuotas(
  client: QuotasClient,
  options?: { fiscalYear?: number; memberId?: string },
): Promise<MemberAnnualQuota[]> {
  let query = client
    .from("member_annual_quotas")
    .select(QUOTA_COLUMNS)
    .order("fiscal_year", { ascending: false });

  if (options?.fiscalYear != null) {
    query = query.eq("fiscal_year", options.fiscalYear);
  }
  if (options?.memberId) {
    query = query.eq("member_id", options.memberId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare le quote: ${error.message}`);
  }

  return (data ?? []).map((row) => mapQuota(row as QuotaRow));
}

export async function upsertMemberAnnualQuotas(
  client: QuotasClient,
  rows: MemberAnnualQuotaInput[],
): Promise<BulkQuotaUpsertResult> {
  if (rows.length === 0) {
    return { success: false, errorMessage: "Nessuna riga da salvare." };
  }

  for (const row of rows) {
    if (!row.memberId) {
      return { success: false, errorMessage: "Seleziona un associato per ogni riga." };
    }
    if (!Number.isInteger(row.fiscalYear) || row.fiscalYear < 2000) {
      return { success: false, errorMessage: "Anno fiscale non valido." };
    }
    if (!row.paidAt) {
      return {
        success: false,
        errorMessage: "Inserisci la data di pagamento per ogni riga.",
      };
    }
  }

  const payload = rows.map((row) => ({
    member_id: row.memberId,
    fiscal_year: row.fiscalYear,
    paid_at: paidAtToIso(row.paidAt),
    amount_paid_eur: row.amountPaidEur ?? null,
    amount_due_eur: row.amountDueEur ?? null,
    notes: row.notes ?? null,
  }));

  const { data, error } = await client
    .from("member_annual_quotas")
    .upsert(payload, { onConflict: "member_id,fiscal_year" })
    .select("id");

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile salvare le quote.",
    };
  }

  return { success: true, upsertedCount: data?.length ?? rows.length };
}
