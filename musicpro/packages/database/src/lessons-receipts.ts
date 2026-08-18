import type { SupabaseClient } from "@supabase/supabase-js";

import { todayInRome } from "./bookings";
import type { CourseMutationResult } from "./courses";
import { sendLessonFamilyEmail } from "./messaging";
import type { Database } from "./types/database";

type ReceiptsClient = SupabaseClient<Database>;

type ReceiptRow = Database["public"]["Tables"]["fiscal_receipts"]["Row"];
type ReceiptLineRow = Database["public"]["Tables"]["fiscal_receipt_lines"]["Row"];
type PaymentRow = Database["public"]["Tables"]["lesson_pack_payments"]["Row"];

const DEFAULT_QUOTA_EUR = 15;

const MEMBER_PAYEE_COLUMNS =
  "id, first_name, last_name, email, tax_code, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_email, manual_tutor_tax_code";

type MemberPayeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  tax_code: string | null;
  manual_tutor_first_name: string | null;
  manual_tutor_last_name: string | null;
  manual_tutor_email: string | null;
  manual_tutor_tax_code: string | null;
};

export type FiscalReceiptRow = {
  id: string;
  code: string;
  numberN: number;
  year: number;
  issuedOn: string;
  status: "emessa" | "sostituita";
  paymentId: string | null;
  memberId: string;
  payeeName: string;
  payeeTaxCode: string | null;
  payeeEmail: string | null;
  amountEur: number;
  method: string;
  emailedAt: string | null;
  lines: { description: string; amountEur: number }[];
};

type ReceiptLineInput = { description: string; amountEur: number };

function fail(
  errorMessage: string,
  extras: Partial<CourseMutationResult> = {},
): CourseMutationResult {
  return { success: false, errorMessage, ...extras };
}

function ok(id?: string, warnings?: string[]): CourseMutationResult {
  const result: CourseMutationResult = { success: true };
  if (id) result.id = id;
  if (warnings && warnings.length > 0) result.warnings = warnings;
  return result;
}

function toEur(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function personLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function csvEscape(value: string): string {
  if (/[;"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatCsvEuro(amount: number): string {
  return toEur(amount).toFixed(2).replace(".", ",");
}

function formatCsvDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function mapReceipt(
  row: ReceiptRow,
  lines: Pick<ReceiptLineRow, "description" | "amount_eur" | "sort_order">[],
): FiscalReceiptRow {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: row.id,
    code: row.code,
    numberN: row.number_n,
    year: row.year,
    issuedOn: row.issued_on,
    status: row.status,
    paymentId: row.payment_id,
    memberId: row.member_id,
    payeeName: row.payee_name,
    payeeTaxCode: row.payee_tax_code,
    payeeEmail: row.payee_email,
    amountEur: toEur(row.amount_eur),
    method: row.method,
    emailedAt: row.emailed_at,
    lines: sorted.map((line) => ({
      description: line.description,
      amountEur: toEur(line.amount_eur),
    })),
  };
}

function payeeFromMember(member: MemberPayeeRow): {
  payeeName: string;
  payeeTaxCode: string | null;
  payeeEmail: string | null;
} {
  const tutorFirst = member.manual_tutor_first_name?.trim() ?? "";
  const tutorLast = member.manual_tutor_last_name?.trim() ?? "";
  if (tutorFirst || tutorLast) {
    return {
      payeeName: personLabel(tutorLast, tutorFirst),
      payeeTaxCode: emptyToNull(member.manual_tutor_tax_code),
      payeeEmail: emptyToNull(member.manual_tutor_email),
    };
  }
  return {
    payeeName: personLabel(member.last_name, member.first_name),
    payeeTaxCode: emptyToNull(member.tax_code),
    payeeEmail: emptyToNull(member.email),
  };
}

function quotaPackLines(amountEur: number): ReceiptLineInput[] {
  if (amountEur > DEFAULT_QUOTA_EUR) {
    return [
      { description: "Quota associativa", amountEur: DEFAULT_QUOTA_EUR },
      {
        description: "Pacchetto lezioni",
        amountEur: toEur(amountEur - DEFAULT_QUOTA_EUR),
      },
    ];
  }
  return [{ description: "Quota associativa", amountEur }];
}

async function linesForPayment(
  client: ReceiptsClient,
  payment: PaymentRow,
): Promise<ReceiptLineInput[]> {
  const amountEur = toEur(payment.amount_eur);
  if (payment.include_quota) {
    return quotaPackLines(amountEur);
  }

  const { data: allocations } = await client
    .from("lesson_fee_allocations")
    .select("amount_eur, fee_id")
    .eq("payment_id", payment.id);

  if (!allocations || allocations.length === 0) {
    return [{ description: "Pacchetto lezioni", amountEur }];
  }

  const feeIds = [...new Set(allocations.map((row) => row.fee_id))];
  const { data: fees } = await client
    .from("lesson_fees")
    .select("id, kind")
    .in("id", feeIds);
  const kindById = new Map((fees ?? []).map((fee) => [fee.id, fee.kind]));

  return allocations.map((row) => ({
    description:
      kindById.get(row.fee_id) === "quota"
        ? "Quota associativa"
        : "Pacchetto lezioni",
    amountEur: toEur(row.amount_eur),
  }));
}

async function loadLinesByReceiptIds(
  client: ReceiptsClient,
  receiptIds: string[],
): Promise<Map<string, ReceiptLineRow[]>> {
  const byReceipt = new Map<string, ReceiptLineRow[]>();
  if (receiptIds.length === 0) return byReceipt;

  const { data, error } = await client
    .from("fiscal_receipt_lines")
    .select("*")
    .in("receipt_id", receiptIds)
    .order("sort_order", { ascending: true });
  if (error) {
    throw new Error(error.message || "Impossibile caricare le righe ricevuta.");
  }
  for (const line of data ?? []) {
    const list = byReceipt.get(line.receipt_id) ?? [];
    list.push(line);
    byReceipt.set(line.receipt_id, list);
  }
  return byReceipt;
}

async function insertReceiptWithLines(
  client: ReceiptsClient,
  input: {
    issuedOn: string;
    paymentId: string | null;
    memberId: string;
    payeeName: string;
    payeeTaxCode: string | null;
    payeeEmail: string | null;
    amountEur: number;
    method: string;
    lines: ReceiptLineInput[];
    replacesId?: string | null;
    createdBy?: string | null;
    pdfBase64?: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const year = Number.parseInt(input.issuedOn.slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 2000) {
    return { error: "Anno ricevuta non valido." };
  }

  const { data: numberN, error: rpcError } = await client.rpc(
    "next_fiscal_receipt_number",
    { p_year: year },
  );
  if (rpcError || numberN == null) {
    return {
      error: rpcError?.message || "Impossibile assegnare il numero ricevuta.",
    };
  }

  const code = `S/${numberN}/${year}`;
  const { data: inserted, error: insertError } = await client
    .from("fiscal_receipts")
    .insert({
      number_n: numberN,
      year,
      code,
      issued_on: input.issuedOn,
      status: "emessa",
      replaces_id: input.replacesId ?? null,
      payment_id: input.paymentId,
      member_id: input.memberId,
      payee_name: input.payeeName,
      payee_tax_code: input.payeeTaxCode,
      payee_email: input.payeeEmail,
      amount_eur: input.amountEur,
      method: input.method,
      pdf_base64: input.pdfBase64 ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return {
      error: insertError?.message || "Impossibile salvare la ricevuta.",
    };
  }

  if (input.lines.length > 0) {
    const { error: linesError } = await client
      .from("fiscal_receipt_lines")
      .insert(
        input.lines.map((line, index) => ({
          receipt_id: inserted.id,
          description: line.description,
          amount_eur: line.amountEur,
          sort_order: index,
        })),
      );
    if (linesError) {
      return {
        error: linesError.message || "Ricevuta creata senza righe.",
      };
    }
  }

  return { id: inserted.id };
}

export async function emitFiscalReceiptForPayment(
  client: ReceiptsClient,
  input: {
    paymentId: string;
    actorMemberId?: string | null;
    pdfBase64?: string | null;
  },
): Promise<CourseMutationResult> {
  const paymentId = input.paymentId.trim();
  if (!paymentId) return fail("Manca il pagamento.");

  const { data: existing, error: existingError } = await client
    .from("fiscal_receipts")
    .select("id")
    .eq("payment_id", paymentId)
    .eq("status", "emessa")
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return fail(existingError.message || "Impossibile verificare le ricevute.");
  }
  if (existing) return ok(existing.id);

  const { data: payment, error: paymentError } = await client
    .from("lesson_pack_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) {
    return fail(paymentError.message || "Impossibile caricare il pagamento.");
  }
  if (!payment) return fail("Pagamento non trovato.");

  const { data: member, error: memberError } = await client
    .from("members")
    .select(MEMBER_PAYEE_COLUMNS)
    .eq("id", payment.member_id)
    .maybeSingle();
  if (memberError) {
    return fail(memberError.message || "Impossibile caricare l'associato.");
  }
  if (!member) return fail("Associato non trovato.");

  const payee = payeeFromMember(member);
  const issuedOn = payment.paid_on?.slice(0, 10) || todayInRome();
  const lines = await linesForPayment(client, payment);
  const created = await insertReceiptWithLines(client, {
    issuedOn,
    paymentId: payment.id,
    memberId: payment.member_id,
    payeeName: payee.payeeName,
    payeeTaxCode: payee.payeeTaxCode,
    payeeEmail: payee.payeeEmail,
    amountEur: toEur(payment.amount_eur),
    method: payment.method,
    lines,
    createdBy: input.actorMemberId ?? null,
    pdfBase64: input.pdfBase64 ?? null,
  });
  if ("error" in created) return fail(created.error);
  return ok(created.id);
}

export async function getFiscalReceipt(
  client: ReceiptsClient,
  receiptId: string,
): Promise<FiscalReceiptRow | null> {
  const { data, error } = await client
    .from("fiscal_receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Impossibile caricare la ricevuta.");
  }
  if (!data) return null;

  const lines = await loadLinesByReceiptIds(client, [data.id]);
  return mapReceipt(data, lines.get(data.id) ?? []);
}

export async function listFiscalReceipts(
  client: ReceiptsClient,
  options?: {
    from?: string;
    to?: string;
    memberId?: string;
    includeReplaced?: boolean;
  },
): Promise<FiscalReceiptRow[]> {
  let query = client
    .from("fiscal_receipts")
    .select("*")
    .order("issued_on", { ascending: false })
    .order("number_n", { ascending: false });

  if (options?.from) query = query.gte("issued_on", options.from);
  if (options?.to) query = query.lte("issued_on", options.to);
  if (options?.memberId) query = query.eq("member_id", options.memberId);
  if (!options?.includeReplaced) query = query.eq("status", "emessa");

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Impossibile caricare le ricevute.");
  }

  const rows = data ?? [];
  const lines = await loadLinesByReceiptIds(
    client,
    rows.map((row) => row.id),
  );
  return rows.map((row) => mapReceipt(row, lines.get(row.id) ?? []));
}

export async function markFiscalReceiptEmailed(
  client: ReceiptsClient,
  receiptId: string,
): Promise<CourseMutationResult> {
  const { error } = await client
    .from("fiscal_receipts")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", receiptId);
  if (error) {
    return fail(error.message || "Impossibile aggiornare l'invio.");
  }
  return ok(receiptId);
}

export async function emailFiscalReceiptCopy(
  client: ReceiptsClient,
  input: {
    receiptId: string;
    attachments: { filename: string; contentBase64: string }[];
  },
): Promise<CourseMutationResult> {
  const receipt = await getFiscalReceipt(client, input.receiptId);
  if (!receipt) return fail("Ricevuta non trovata.");

  const result = await sendLessonFamilyEmail(client, receipt.memberId, {
    subject: `Ricevuta ${receipt.code} — MusicPro School`,
    body: [
      "Ciao,",
      "",
      `in allegato la copia della ricevuta ${receipt.code} di MusicPro School.`,
      "",
      "Grazie,",
      "MusicPro School",
    ].join("\n"),
    attachments: input.attachments,
  });

  if (result.sent === 0) {
    return fail(
      result.warnings.join(" ") || "Impossibile inviare la copia ricevuta.",
    );
  }

  const marked = await markFiscalReceiptEmailed(client, receipt.id);
  if (!marked.success) return marked;
  return ok(receipt.id, result.warnings);
}

export async function replaceFiscalReceipt(
  client: ReceiptsClient,
  input: {
    receiptId: string;
    actorMemberId: string;
    pdfBase64?: string | null;
  },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Manca l'operatore dello storno.");
  }

  const old = await getFiscalReceipt(client, input.receiptId);
  if (!old) return fail("Ricevuta non trovata.");
  if (old.status !== "emessa") {
    return fail("Si può stornare solo una ricevuta emessa.");
  }

  const created = await insertReceiptWithLines(client, {
    issuedOn: todayInRome(),
    paymentId: old.paymentId,
    memberId: old.memberId,
    payeeName: old.payeeName,
    payeeTaxCode: old.payeeTaxCode,
    payeeEmail: old.payeeEmail,
    amountEur: old.amountEur,
    method: old.method,
    lines: old.lines,
    replacesId: old.id,
    createdBy: input.actorMemberId,
    pdfBase64: input.pdfBase64 ?? null,
  });
  if ("error" in created) return fail(created.error);

  const { error: updateError } = await client
    .from("fiscal_receipts")
    .update({ status: "sostituita" })
    .eq("id", old.id);
  if (updateError) {
    return fail(
      updateError.message ||
        "Nuova ricevuta emessa, ma la precedente non è stata stornata.",
      { id: created.id },
    );
  }

  return ok(created.id);
}

export function fiscalReceiptsCsv(rows: FiscalReceiptRow[]): string {
  const header = [
    "numero",
    "data",
    "intestatario",
    "CF",
    "importo",
    "causale",
    "metodo",
  ].join(";");
  const lines = rows.map((row) =>
    [
      csvEscape(row.code),
      csvEscape(formatCsvDate(row.issuedOn)),
      csvEscape(row.payeeName),
      csvEscape(row.payeeTaxCode ?? ""),
      csvEscape(formatCsvEuro(row.amountEur)),
      csvEscape(
        row.lines.map((line) => line.description).join(" + ") ||
          "Pacchetto lezioni",
      ),
      csvEscape(row.method),
    ].join(";"),
  );
  return [header, ...lines].join("\n");
}
