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
  receiptsNotes: string | null;
  receiptsStatus: ReceiptsStatus;
  paymentMethod: string | null;
  paymentDate: string | null;
  pdfUrl: string | null;
  pdfStoragePath: string | null;
  signatureRequired: boolean;
  signedAt: string | null;
}

export interface ReimbursementListResult {
  reimbursements: ReimbursementDisplay[];
  totalAmountEur: number;
}

export interface PaymentPart {
  method: string;
  amount: number;
}

export interface MemberReceiptsBalance {
  memberId: string;
  totalReceiptsEur: number;
  totalGrossEur: number;
  /** SUM(receipts) - SUM(gross). Positive = surplus, negative = debt. */
  balanceEur: number;
}

type ReimbursementRow = {
  id: string;
  member_id: string;
  fiscal_year: number;
  progressive: string;
  gross_amount_eur: number;
  generated_at: string;
  receipts_amount_eur: number | null;
  receipts_notes: string | null;
  receipts_status: ReceiptsStatus;
  payment_method: string | null;
  payment_date: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  signature_required: boolean;
  signed_at: string | null;
};

const REIMBURSEMENT_COLUMNS =
  "id, member_id, fiscal_year, progressive, gross_amount_eur, generated_at, receipts_amount_eur, receipts_notes, receipts_status, payment_method, payment_date, pdf_url, pdf_storage_path, signature_required, signed_at";

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
    receiptsNotes: row.receipts_notes,
    receiptsStatus: row.receipts_status,
    paymentMethod: row.payment_method,
    paymentDate: row.payment_date,
    pdfUrl: row.pdf_url,
    pdfStoragePath: row.pdf_storage_path,
    signatureRequired: row.signature_required,
    signedAt: row.signed_at,
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
  params: { fiscalYear?: number; memberId?: string } = {},
): Promise<ReimbursementListResult> {
  let query = client
    .from("reimbursements")
    .select(REIMBURSEMENT_COLUMNS)
    .order("generated_at", { ascending: false });

  if (params.fiscalYear != null) {
    query = query.eq("fiscal_year", params.fiscalYear);
  }

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

export async function getReimbursementById(
  client: ReimbursementsClient,
  id: string,
): Promise<ReimbursementDisplay | null> {
  const { data, error } = await client
    .from("reimbursements")
    .select(REIMBURSEMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare il rimborso: ${error.message}`);
  }

  if (!data) return null;

  const row = data as ReimbursementRow;
  const names = await loadMemberNames(client, [row.member_id]);
  return mapReimbursement(row, names.get(row.member_id) ?? "—");
}

export interface ReimbursementMutationResult {
  success: boolean;
  id?: string;
  progressive?: string;
  errorMessage?: string;
}

export async function updateReceiptsAmount(
  client: ReimbursementsClient,
  id: string,
  receiptsAmountEur: number,
): Promise<ReimbursementMutationResult> {
  const current = await getReimbursementById(client, id);
  if (!current) {
    return { success: false, errorMessage: "Rimborso non trovato." };
  }

  const historic = await getMemberReceiptsBalance(client, current.memberId, {
    excludeId: id,
  });
  const receiptsNotes = buildReceiptsNote({
    grossAmountEur: current.grossAmountEur,
    receiptsAmountEur,
    historicBalanceEur: historic.balanceEur,
  });

  const { error } = await client
    .from("reimbursements")
    .update({
      receipts_amount_eur: receiptsAmountEur,
      receipts_notes: receiptsNotes,
    } as never)
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

export async function deleteReimbursements(
  client: ReimbursementsClient,
  ids: string[],
): Promise<ReimbursementMutationResult> {
  if (ids.length === 0) {
    return { success: true };
  }

  const { error } = await client.from("reimbursements").delete().in("id", ids);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true };
}

export async function updateReimbursementPdf(
  client: ReimbursementsClient,
  id: string,
  params: { pdfUrl: string | null; pdfStoragePath?: string | null },
): Promise<ReimbursementMutationResult> {
  const { error } = await client
    .from("reimbursements")
    .update({
      pdf_url: params.pdfUrl,
      pdf_storage_path: params.pdfStoragePath ?? null,
    } as never)
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message,
    };
  }

  return { success: true, id };
}

/**
 * Balance = SUM(receipts) - SUM(gross) across all reimbursements for the member.
 * Positive = surplus (credit from past receipts); negative = debt.
 */

/** GAS-style amount: `€ 100,00` (symbol before, comma decimal). */
export function formatEuroPrefix(amount: number): string {
  return `€ ${formatPaymentAmountIt(amount)}`;
}

/** GAS `{{IMPORTO}}`: `100.00` (period decimal, no currency). */
export function formatImportoPlain(amount: number): string {
  return Number(amount).toFixed(2);
}

/**
 * Template line: `Versati a rimborso totale in {metodo} il {data}`.
 * `payment_method` already looks like `Bonifico Bancario: € 100,00`.
 */
export function buildVersatiRimborsoLine(params: {
  paymentMethod: string | null | undefined;
  grossAmountEur: number;
  paymentDateLabel: string;
}): string {
  const method = params.paymentMethod?.trim() || "—";
  const mid = /\d/.test(method)
    ? method
    : `${method}: € ${formatImportoPlain(params.grossAmountEur)}`;
  return `Versati a rimborso totale in ${mid} il ${params.paymentDateLabel}`;
}

export function buildReceiptsNote(params: {
  grossAmountEur: number;
  receiptsAmountEur: number;
  historicBalanceEur: number;
}): string {
  const receipts = formatEuroPrefix(params.receiptsAmountEur);
  const delta = params.grossAmountEur - params.receiptsAmountEur;
  let line = `Importo consegnato: ${receipts}`;
  if (delta > 0.01) {
    if (params.historicBalanceEur >= delta - 0.01) {
      line += `\nScontrini precedentemente ricevuti: ${formatEuroPrefix(delta)}`;
    } else {
      line += `\nRicevute ancora da consegnare (anticipo): ${formatEuroPrefix(delta)}`;
    }
  } else if (delta < -0.01) {
    line += `\nEccedenza a credito per prossimi rimborsi: ${formatEuroPrefix(Math.abs(delta))}`;
  }
  return line;
}

export function isExternalPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url) && !url.includes("/storage/v1/object/");
}

export async function getMemberReceiptsBalance(
  client: ReimbursementsClient,
  memberId: string,
  options?: { excludeId?: string },
): Promise<MemberReceiptsBalance> {
  let query = client
    .from("reimbursements")
    .select("id, gross_amount_eur, receipts_amount_eur")
    .eq("member_id", memberId);

  if (options?.excludeId) {
    query = query.neq("id", options.excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile calcolare il saldo ricevute: ${error.message}`);
  }

  let totalGrossEur = 0;
  let totalReceiptsEur = 0;

  for (const row of (data ?? []) as {
    id: string;
    gross_amount_eur: number;
    receipts_amount_eur: number | null;
  }[]) {
    const gross = Number(row.gross_amount_eur) || 0;
    const receiptsRaw = row.receipts_amount_eur;
    // Legacy GAS: empty receipts treated as equal to gross
    const receipts =
      receiptsRaw === null || receiptsRaw === undefined
        ? gross
        : Number(receiptsRaw) || 0;
    totalGrossEur += gross;
    totalReceiptsEur += receipts;
  }

  const balanceEur =
    Math.round((totalReceiptsEur - totalGrossEur) * 100) / 100;

  return {
    memberId,
    totalReceiptsEur: Math.round(totalReceiptsEur * 100) / 100,
    totalGrossEur: Math.round(totalGrossEur * 100) / 100,
    balanceEur,
  };
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

/**
 * Returns the next progressive number (1-based integer) for member+year.
 * Usable by batch with an in-memory offset.
 */
export async function getNextProgressive(
  client: ReimbursementsClient,
  memberId: string,
  fiscalYear: number,
): Promise<string> {
  const next = await getNextProgressiveNumber(client, memberId, fiscalYear);
  return formatProgressive(next);
}

async function getNextProgressiveNumber(
  client: ReimbursementsClient,
  memberId: string,
  fiscalYear: number,
): Promise<number> {
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

  return max + 1;
}

export function formatPaymentAmountIt(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Builds concatenated payment_method string, e.g.
 * "Bonifico Bancario: € 50,00, Contanti: € 30,00"
 */
export function formatPaymentMethodString(parts: PaymentPart[]): string {
  return parts
    .filter((p) => p.method && p.amount > 0)
    .map((p) => `${p.method}: € ${formatPaymentAmountIt(p.amount)}`)
    .join(", ");
}

export function sumPaymentParts(parts: PaymentPart[]): number {
  return parts.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function paymentPartsMatchGross(
  parts: PaymentPart[],
  grossAmountEur: number,
  tolerance = 0.01,
): boolean {
  return Math.abs(sumPaymentParts(parts) - grossAmountEur) <= tolerance;
}

/**
 * Creates a reimbursement record.
 */
export async function generateReimbursement(
  client: ReimbursementsClient,
  input: GenerateReimbursementInput,
  createdByMemberId: string,
  progressiveOverride?: string,
): Promise<ReimbursementMutationResult> {
  if (input.grossAmountEur <= 0) {
    return {
      success: false,
      errorMessage: "L'importo lordo deve essere maggiore di zero.",
    };
  }

  if (!input.paymentMethod?.trim()) {
    return {
      success: false,
      errorMessage: "Metodo di pagamento obbligatorio.",
    };
  }

  try {
    const progressive =
      progressiveOverride ??
      (await getNextProgressive(client, input.memberId, input.fiscalYear));

    const gross = input.grossAmountEur;
    const receipts = input.receiptsAmountEur ?? 0;
    const historic = await getMemberReceiptsBalance(client, input.memberId);
    const receiptsNotes = buildReceiptsNote({
      grossAmountEur: gross,
      receiptsAmountEur: receipts,
      historicBalanceEur: historic.balanceEur,
    });

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
        receipts_notes: receiptsNotes,
        pdf_url: null,
        pdf_storage_path: null,
        signature_required: true,
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
      progressive,
    };
  } catch (err) {
    return {
      success: false,
      errorMessage:
        err instanceof Error ? err.message : "Errore durante la generazione.",
    };
  }
}

export interface GenerateBatchResult {
  success: boolean;
  results: ReimbursementMutationResult[];
  createdIds: string[];
  errorMessage?: string;
}

/**
 * Creates multiple reimbursements, allocating progressive numbers per member+year
 * with an in-batch offset so concurrent cards for the same associate stay sequential.
 */
export async function generateReimbursementsBatch(
  client: ReimbursementsClient,
  inputs: GenerateReimbursementInput[],
  createdByMemberId: string,
): Promise<GenerateBatchResult> {
  if (inputs.length === 0) {
    return {
      success: false,
      results: [],
      createdIds: [],
      errorMessage: "Nessun rimborso da generare.",
    };
  }

  const counters = new Map<string, number>();
  const results: ReimbursementMutationResult[] = [];
  const createdIds: string[] = [];

  for (const input of inputs) {
    const key = `${input.memberId}:${input.fiscalYear}`;
    try {
      if (!counters.has(key)) {
        const next = await getNextProgressiveNumber(
          client,
          input.memberId,
          input.fiscalYear,
        );
        counters.set(key, next);
      }
      const n = counters.get(key)!;
      const progressive = formatProgressive(n);
      counters.set(key, n + 1);

      const result = await generateReimbursement(
        client,
        input,
        createdByMemberId,
        progressive,
      );
      results.push(result);
      if (result.success && result.id) {
        createdIds.push(result.id);
      }
    } catch (err) {
      results.push({
        success: false,
        errorMessage:
          err instanceof Error ? err.message : "Errore durante la generazione.",
      });
    }
  }

  const allOk = results.every((r) => r.success);
  return {
    success: allOk,
    results,
    createdIds,
    errorMessage: allOk
      ? undefined
      : "Alcuni rimborsi non sono stati generati. Controlla i dettagli.",
  };
}

export async function signReimbursement(
  client: ReimbursementsClient,
  id: string,
): Promise<ReimbursementMutationResult> {
  const current = await getReimbursementById(client, id);
  if (!current) {
    return { success: false, errorMessage: "Rimborso non trovato." };
  }
  if (!current.signatureRequired) {
    return { success: false, errorMessage: "Questa notula non richiede firma." };
  }
  if (current.signedAt) {
    return { success: true, id };
  }

  const { error } = await client
    .from("reimbursements")
    .update({ signed_at: new Date().toISOString() } as never)
    .eq("id", id)
    .is("signed_at", null);

  if (error) {
    return { success: false, errorMessage: error.message };
  }

  return { success: true, id };
}

export async function ensureReceiptsNotes(
  client: ReimbursementsClient,
  reimbursement: ReimbursementDisplay,
): Promise<string> {
  if (reimbursement.receiptsNotes?.trim()) {
    return reimbursement.receiptsNotes.trim();
  }

  const historic = await getMemberReceiptsBalance(
    client,
    reimbursement.memberId,
    { excludeId: reimbursement.id },
  );
  const notes = buildReceiptsNote({
    grossAmountEur: reimbursement.grossAmountEur,
    receiptsAmountEur: reimbursement.receiptsAmountEur,
    historicBalanceEur: historic.balanceEur,
  });

  await client
    .from("reimbursements")
    .update({ receipts_notes: notes } as never)
    .eq("id", reimbursement.id);

  return notes;
}

export const RECEIPTS_STATUS_LABELS: Record<ReceiptsStatus, string> = {
  mancante: "Mancante",
  parziale: "Parziale",
  completo: "Completo",
};

export const DEFAULT_PAYMENT_METHODS = [
  "Bonifico Bancario",
  "Contanti",
  "PayPal",
  "Simplia",
  "Acquisti per c/ associato",
] as const;

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatDateItalian(isoDate: string | null | undefined): string {
  if (!isoDate?.trim()) return "—";
  const raw = isoDate.trim();
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const parsed = dateOnly
    ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T12:00:00+01:00`)
    : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}
