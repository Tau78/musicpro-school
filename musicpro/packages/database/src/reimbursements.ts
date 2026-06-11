import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type ReimbursementsClient = SupabaseClient<Database>;

export type ReceiptsStatus = "mancante" | "parziale" | "completo";

export interface ReimbursementDisplay {
  id: string;
  memberId: string;
  associateName: string;
  fiscalYear: number;
  progressive: string;
  grossAmountEur: number;
  generatedAt: string;
  receiptsAmountEur: number;
  receiptsStatus: ReceiptsStatus;
  paymentMethod: string | null;
  paymentDate: string | null;
  pdfUrl: string | null;
}

export interface ReimbursementListResult {
  reimbursements: ReimbursementDisplay[];
  totalAmountEur: number;
}

type ReimbursementRow = {
  id: string;
  member_id: string;
  fiscal_year: number;
  progressive: string;
  gross_amount_eur: number;
  generated_at: string;
  receipts_amount_eur: number | null;
  receipts_status: ReceiptsStatus;
  payment_method: string | null;
  payment_date: string | null;
  pdf_url: string | null;
};

const REIMBURSEMENT_COLUMNS =
  "id, member_id, fiscal_year, progressive, gross_amount_eur, generated_at, receipts_amount_eur, receipts_status, payment_method, payment_date, pdf_url";

function mapReimbursement(
  row: ReimbursementRow,
  memberName: string,
): ReimbursementDisplay {
  return {
    id: row.id,
    memberId: row.member_id,
    associateName: memberName,
    fiscalYear: row.fiscal_year,
    progressive: row.progressive,
    grossAmountEur: Number(row.gross_amount_eur),
    generatedAt: row.generated_at,
    receiptsAmountEur: Number(row.receipts_amount_eur ?? 0),
    receiptsStatus: row.receipts_status,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    pdfUrl: row.pdf_url,
  };
}

async function loadMemberNames(
  client: ReimbursementsClient,
  memberIds: string[],
): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map();

  const { data, error } = await client
    .from("members")
    .select("id, first_name, last_name")
    .in("id", memberIds);

  if (error) {
    throw new Error(`Impossibile caricare i nomi associati: ${error.message}`);
  }

  const map = new Map<string, string>();
  for (const row of (data ?? []) as {
    id: string;
    first_name: string;
    last_name: string;
  }[]) {
    map.set(row.id, `${row.first_name} ${row.last_name}`.trim());
  }
  return map;
}

export async function listReimbursements(
  client: ReimbursementsClient,
  params: { fiscalYear: number; memberId?: string },
): Promise<ReimbursementListResult> {
  let query = client
    .from("reimbursements")
    .select(REIMBURSEMENT_COLUMNS)
    .eq("fiscal_year", params.fiscalYear)
    .order("generated_at", { ascending: false });

  if (params.memberId) {
    query = query.eq("member_id", params.memberId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare i rimborsi: ${error.message}`);
  }

  const rows = (data ?? []) as ReimbursementRow[];
  const memberIds = [...new Set(rows.map((row) => row.member_id))];
  const memberNames = await loadMemberNames(client, memberIds);

  const reimbursements = rows.map((row) =>
    mapReimbursement(row, memberNames.get(row.member_id) ?? "—"),
  );
  const totalAmountEur = reimbursements.reduce(
    (sum, item) => sum + item.grossAmountEur,
    0,
  );

  return { reimbursements, totalAmountEur };
}

export interface ReimbursementMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

export async function updateReceiptsAmount(
  client: ReimbursementsClient,
  id: string,
  receiptsAmountEur: number,
): Promise<ReimbursementMutationResult> {
  const { error } = await client
    .from("reimbursements")
    .update({ receipts_amount_eur: receiptsAmountEur } as never)
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true, id };
}

export async function deleteReimbursement(
  client: ReimbursementsClient,
  id: string,
): Promise<ReimbursementMutationResult> {
  const { error } = await client.from("reimbursements").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true };
}

export interface GenerateReimbursementInput {
  memberId: string;
  fiscalYear: number;
  grossAmountEur: number;
  paymentMethod: string;
  paymentDate?: string;
  receiptsAmountEur?: number;
}

function parseProgressiveNumber(progressive: string): number {
  const digits = progressive.replace(/\D/g, "");
  return parseInt(digits, 10) || 0;
}

function formatProgressive(n: number): string {
  return String(n).padStart(2, "0");
}

async function getNextProgressive(
  client: ReimbursementsClient,
  memberId: string,
  fiscalYear: number,
): Promise<string> {
  const { data, error } = await client
    .from("reimbursements")
    .select("progressive")
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear);

  if (error) {
    throw new Error(`Impossibile calcolare il progressivo: ${error.message}`);
  }

  let max = 0;
  for (const row of (data ?? []) as { progressive: string }[]) {
    const value = parseProgressiveNumber(row.progressive);
    if (value > max) max = value;
  }

  return formatProgressive(max + 1);
}

/**
 * Creates a reimbursement record. PDF generation from Google Docs template
 * is not migrated yet — see TODO in apps/web generate form.
 */
export async function generateReimbursement(
  client: ReimbursementsClient,
  input: GenerateReimbursementInput,
  createdByMemberId: string,
): Promise<ReimbursementMutationResult> {
  if (input.grossAmountEur <= 0) {
    return {
      success: false,
      errorMessage: "L'importo lordo deve essere maggiore di zero.",
    };
  }

  try {
    const progressive = await getNextProgressive(
      client,
      input.memberId,
      input.fiscalYear,
    );

    const gross = input.grossAmountEur;
    const receipts = input.receiptsAmountEur ?? 0;

    const { data, error } = await client
      .from("reimbursements")
      .insert({
        member_id: input.memberId,
        created_by_member_id: createdByMemberId,
        fiscal_year: input.fiscalYear,
        progressive,
        gross_amount_eur: gross,
        withholding_eur: gross,
        net_amount_eur: gross,
        payment_method: input.paymentMethod,
        payment_date: input.paymentDate ?? null,
        receipts_amount_eur: receipts,
        pdf_url: null,
      } as never)
      .select("id")
      .single();

    if (error) {
      return {
        success: false,
        errorMessage: error.message,
      };
    }

    return {
      success: true,
      id: (data as { id: string }).id,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage:
        err instanceof Error ? err.message : "Errore durante la generazione.",
    };
  }
}

export const RECEIPTS_STATUS_LABELS: Record<ReceiptsStatus, string> = {
  mancante: "Mancante",
  parziale: "Parziale",
  completo: "Completo",
};

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDateItalian(isoDate: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDate));
}
