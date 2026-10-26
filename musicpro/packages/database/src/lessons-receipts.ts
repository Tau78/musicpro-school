import type { SupabaseClient } from "@supabase/supabase-js";

import {
  SCHOOL_APP_URL,
  schoolEmailBodyFromText,
  schoolEmailTextFooter,
  wrapSchoolEmail,
} from "@musicpro/shared";

import { formatCreditsCount, todayInRome } from "./bookings";
import type { CourseMutationResult } from "./courses";
import {
  FISCAL_RECEIPT_SECTION,
  fiscalReceiptSectionFilterCodes,
  type FiscalReceiptSectionCode,
} from "./fiscal-receipt-sections";
import { sendLessonFamilyEmail } from "./messaging";
import type { Database } from "./types/database";

type ReceiptsClient = SupabaseClient<Database>;

type ReceiptRow = Database["public"]["Tables"]["fiscal_receipts"]["Row"];
type ReceiptLineRow = Database["public"]["Tables"]["fiscal_receipt_lines"]["Row"];
type PaymentRow = Database["public"]["Tables"]["lesson_pack_payments"]["Row"];

const DEFAULT_QUOTA_EUR = 15;

export type FiscalReceiptSourceType =
  | "lesson_pack"
  | "room_booking"
  | "quota_payment"
  | "credit_shop"
  | "manual";

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
  section: string;
  numberN: number;
  year: number;
  issuedOn: string;
  status: "emessa" | "sostituita" | "annullata";
  paymentId: string | null;
  sourceType: FiscalReceiptSourceType | null;
  sourceId: string | null;
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

function inferSourceType(row: ReceiptRow): FiscalReceiptSourceType | null {
  if (row.source_type === "lesson_pack") return "lesson_pack";
  if (row.source_type === "room_booking") return "room_booking";
  if (row.source_type === "quota_payment") return "quota_payment";
  if (row.source_type === "credit_shop") return "credit_shop";
  if (row.source_type === "manual") return "manual";
  if (row.payment_id) return "lesson_pack";
  if (row.section === "SA" || row.section === "SAL") return "room_booking";
  if (row.section === "QU" || row.section === "QUO") return "quota_payment";
  if (row.section === "LE" || row.section === "S" || row.section === "SCH") {
    return "lesson_pack";
  }
  if (row.section === "SER") return "credit_shop";
  return null;
}

function mapReceipt(
  row: ReceiptRow,
  lines: Pick<ReceiptLineRow, "description" | "amount_eur" | "sort_order">[],
): FiscalReceiptRow {
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  const sourceType = inferSourceType(row);
  return {
    id: row.id,
    code: row.code,
    section: row.section,
    numberN: row.number_n,
    year: row.year,
    issuedOn: row.issued_on,
    status: row.status,
    paymentId: row.payment_id,
    sourceType,
    sourceId: row.source_id ?? (sourceType === "lesson_pack" ? row.payment_id : null),
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

function paymentMethodFromExternalId(externalId: string | null): string {
  if (!externalId) return "carta";
  if (externalId.startsWith("pi_")) return "stripe";
  return "nexi";
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

async function memberHasActiveAssociatoRole(
  client: ReceiptsClient,
  memberId: string,
): Promise<boolean> {
  const { data } = await client
    .from("member_roles")
    .select("id")
    .eq("member_id", memberId)
    .eq("role", "associato")
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

function sectionForSourceType(
  sourceType: FiscalReceiptSourceType,
): FiscalReceiptSectionCode {
  switch (sourceType) {
    case "lesson_pack":
      return FISCAL_RECEIPT_SECTION.SCH;
    case "room_booking":
      return FISCAL_RECEIPT_SECTION.SAL;
    case "quota_payment":
      return FISCAL_RECEIPT_SECTION.QUO;
    case "credit_shop":
    case "manual":
      return FISCAL_RECEIPT_SECTION.SER;
    default:
      return FISCAL_RECEIPT_SECTION.SCH;
  }
}

async function resolveFiscalReceiptSection(
  client: ReceiptsClient,
  memberId: string,
  sourceType: FiscalReceiptSourceType,
): Promise<string> {
  const { data } = await client
    .from("members")
    .select("is_test_account")
    .eq("id", memberId)
    .maybeSingle();
  if (data?.is_test_account) return FISCAL_RECEIPT_SECTION.TEST;

  const isAssociato = await memberHasActiveAssociatoRole(client, memberId);
  if (!isAssociato) return FISCAL_RECEIPT_SECTION.EST;

  return sectionForSourceType(sourceType);
}

async function findEmessaFiscalReceiptId(
  client: ReceiptsClient,
  criteria: {
    paymentId?: string | null;
    sourceType?: FiscalReceiptSourceType | null;
    sourceId?: string | null;
  },
): Promise<string | null> {
  if (criteria.paymentId) {
    const { data } = await client
      .from("fiscal_receipts")
      .select("id")
      .eq("payment_id", criteria.paymentId)
      .eq("status", "emessa")
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  if (criteria.sourceType && criteria.sourceId) {
    const { data } = await client
      .from("fiscal_receipts")
      .select("id")
      .eq("source_type", criteria.sourceType)
      .eq("source_id", criteria.sourceId)
      .eq("status", "emessa")
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  return null;
}

async function loadMemberPayee(
  client: ReceiptsClient,
  memberId: string,
): Promise<MemberPayeeRow | { error: string }> {
  const { data: member, error: memberError } = await client
    .from("members")
    .select(MEMBER_PAYEE_COLUMNS)
    .eq("id", memberId)
    .maybeSingle();
  if (memberError) {
    return {
      error: memberError.message || "Impossibile caricare l'associato.",
    };
  }
  if (!member) return { error: "Associato non trovato." };
  return member as MemberPayeeRow;
}

async function resolveQuotaPaymentMethod(
  client: ReceiptsClient,
  quotaPaymentId: string,
  stripePaymentIntentId: string | null,
): Promise<string> {
  const { data: nexiOrder } = await client
    .from("nexi_payment_orders")
    .select("id")
    .eq("quota_payment_id", quotaPaymentId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  if (nexiOrder) return "nexi";
  return paymentMethodFromExternalId(stripePaymentIntentId);
}

async function resolveRoomBookingMethod(
  client: ReceiptsClient,
  bookingId: string,
  bookingMethod: string | null,
): Promise<string> {
  if (bookingMethod) return bookingMethod;
  const { data: nexiOrder } = await client
    .from("nexi_payment_orders")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("status", "paid")
    .limit(1)
    .maybeSingle();
  if (nexiOrder) return "nexi";
  return "carta";
}

async function insertReceiptWithLines(
  client: ReceiptsClient,
  input: {
    issuedOn: string;
    paymentId: string | null;
    sourceType: FiscalReceiptSourceType;
    sourceId: string;
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

  const section = await resolveFiscalReceiptSection(
    client,
    input.memberId,
    input.sourceType,
  );

  const { data: numberN, error: rpcError } = await client.rpc(
    "next_fiscal_receipt_number",
    { p_year: year, p_section: section },
  );
  if (rpcError || numberN == null) {
    return {
      error: rpcError?.message || "Impossibile assegnare il numero ricevuta.",
    };
  }

  const code = `${section}/${numberN}/${year}`;
  const { data: inserted, error: insertError } = await client
    .from("fiscal_receipts")
    .insert({
      number_n: numberN,
      year,
      section,
      code,
      issued_on: input.issuedOn,
      status: "emessa",
      replaces_id: input.replacesId ?? null,
      payment_id: input.paymentId,
      source_type: input.sourceType,
      source_id: input.sourceId,
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
    if (insertError?.code === "23505") {
      const existingId = await findEmessaFiscalReceiptId(client, {
        paymentId: input.paymentId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      });
      if (existingId) return { id: existingId };
    }
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

  const existingId = await findEmessaFiscalReceiptId(client, {
    paymentId,
    sourceType: "lesson_pack",
    sourceId: paymentId,
  });
  if (existingId) return ok(existingId);

  const { data: payment, error: paymentError } = await client
    .from("lesson_pack_payments")
    .select("*")
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentError) {
    return fail(paymentError.message || "Impossibile caricare il pagamento.");
  }
  if (!payment) return fail("Pagamento non trovato.");

  const member = await loadMemberPayee(client, payment.member_id);
  if ("error" in member) return fail(member.error);

  const payee = payeeFromMember(member);
  const issuedOn = payment.paid_on?.slice(0, 10) || todayInRome();
  const lines = await linesForPayment(client, payment);
  const created = await insertReceiptWithLines(client, {
    issuedOn,
    paymentId: payment.id,
    sourceType: "lesson_pack",
    sourceId: payment.id,
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

export async function emitFiscalReceiptForRoomBooking(
  client: ReceiptsClient,
  input: {
    bookingId: string;
    actorMemberId?: string | null;
    pdfBase64?: string | null;
  },
): Promise<CourseMutationResult> {
  const bookingId = input.bookingId.trim();
  if (!bookingId) return fail("Manca la prenotazione.");

  const existingId = await findEmessaFiscalReceiptId(client, {
    sourceType: "room_booking",
    sourceId: bookingId,
  });
  if (existingId) return ok(existingId);

  const { data: booking, error: bookingError } = await client
    .from("bookings")
    .select(
      "id, member_id, room_id, total_price_eur, payment_status, payment_method, paid_at, status",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) {
    return fail(bookingError.message || "Impossibile caricare la prenotazione.");
  }
  if (!booking) return fail("Prenotazione non trovata.");
  if (booking.status === "cancelled") {
    return fail("Prenotazione annullata — nessuna ricevuta.");
  }
  if (booking.payment_status !== "paid") {
    return fail("La prenotazione non è pagata.");
  }

  const amountEur = toEur(booking.total_price_eur);
  if (amountEur <= 0) {
    return fail("Importo prenotazione non valido per la ricevuta.");
  }

  const member = await loadMemberPayee(client, booking.member_id);
  if ("error" in member) return fail(member.error);

  const { data: room } = await client
    .from("rooms")
    .select("name")
    .eq("id", booking.room_id)
    .maybeSingle();

  const roomLabel = room?.name?.trim() || "sala";
  const payee = payeeFromMember(member);
  const issuedOn = booking.paid_at?.slice(0, 10) || todayInRome();
  const method = await resolveRoomBookingMethod(
    client,
    booking.id,
    booking.payment_method,
  );

  const created = await insertReceiptWithLines(client, {
    issuedOn,
    paymentId: null,
    sourceType: "room_booking",
    sourceId: booking.id,
    memberId: booking.member_id,
    payeeName: payee.payeeName,
    payeeTaxCode: payee.payeeTaxCode,
    payeeEmail: payee.payeeEmail,
    amountEur,
    method,
    lines: [{ description: `Prenotazione ${roomLabel}`, amountEur }],
    createdBy: input.actorMemberId ?? null,
    pdfBase64: input.pdfBase64 ?? null,
  });
  if ("error" in created) return fail(created.error);
  return ok(created.id);
}

export type EmitFiscalReceiptForQuotaInput =
  | {
      quotaPaymentId: string;
      memberId?: string;
      actorMemberId?: string | null;
      pdfBase64?: string | null;
    }
  | {
      memberId: string;
      fiscalYear: number;
      actorMemberId?: string | null;
      pdfBase64?: string | null;
    };

export async function emitFiscalReceiptForQuotaPayment(
  client: ReceiptsClient,
  input: EmitFiscalReceiptForQuotaInput,
): Promise<CourseMutationResult> {
  if ("quotaPaymentId" in input) {
    const quotaPaymentId = input.quotaPaymentId.trim();
    if (!quotaPaymentId) return fail("Manca il pagamento quota.");

    const { data: payment, error: paymentError } = await client
      .from("quota_payments")
      .select("*")
      .eq("id", quotaPaymentId)
      .maybeSingle();
    if (paymentError) {
      return fail(paymentError.message || "Impossibile caricare il pagamento quota.");
    }
    if (!payment) return fail("Pagamento quota non trovato.");

    const { data: items } = await client
      .from("quota_payment_items")
      .select(
        "id, quota_payment_id, member_id, amount_eur, fiscal_year, status",
      )
      .eq("quota_payment_id", quotaPaymentId)
      .eq("status", "completed");

    const targetMemberId =
      input.memberId?.trim() || payment.paid_by_member_id;
    const item = (items ?? []).find((row) => row.member_id === targetMemberId);

    const sourceId = item?.id ?? quotaPaymentId;
    const existingId = await findEmessaFiscalReceiptId(client, {
      sourceType: "quota_payment",
      sourceId,
    });
    if (existingId) return ok(existingId);

    const amountEur = toEur(
      item?.amount_eur ?? payment.total_amount_eur,
    );
    if (amountEur <= 0) {
      return fail("Importo quota non valido per la ricevuta.");
    }

    const member = await loadMemberPayee(client, targetMemberId);
    if ("error" in member) return fail(member.error);

    const payee = payeeFromMember(member);
    const fiscalYear = item?.fiscal_year ?? payment.fiscal_year;
    const issuedOn = payment.created_at.slice(0, 10) || todayInRome();
    const method = await resolveQuotaPaymentMethod(
      client,
      payment.id,
      payment.stripe_payment_intent_id,
    );

    const created = await insertReceiptWithLines(client, {
      issuedOn,
      paymentId: null,
      sourceType: "quota_payment",
      sourceId,
      memberId: targetMemberId,
      payeeName: payee.payeeName,
      payeeTaxCode: payee.payeeTaxCode,
      payeeEmail: payee.payeeEmail,
      amountEur,
      method,
      lines: [
        {
          description: `Quota associativa ${fiscalYear}`,
          amountEur,
        },
      ],
      createdBy: input.actorMemberId ?? null,
      pdfBase64: input.pdfBase64 ?? null,
    });
    if ("error" in created) return fail(created.error);
    return ok(created.id);
  }

  const memberId = input.memberId.trim();
  const fiscalYear = input.fiscalYear;
  if (!memberId) return fail("Manca l'associato.");
  if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
    return fail("Anno quota non valido.");
  }

  const { data: item, error: itemError } = await client
    .from("quota_payment_items")
    .select(
      "id, quota_payment_id, member_id, amount_eur, fiscal_year, status",
    )
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear)
    .eq("status", "completed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (itemError) {
    return fail(itemError.message || "Impossibile caricare la quota pagata.");
  }

  if (item) {
    return emitFiscalReceiptForQuotaPayment(client, {
      quotaPaymentId: item.quota_payment_id,
      memberId,
      actorMemberId: input.actorMemberId,
      pdfBase64: input.pdfBase64,
    });
  }

  const { data: annualQuota, error: annualError } = await client
    .from("member_annual_quotas")
    .select("id, member_id, fiscal_year, paid_at, amount_paid_eur")
    .eq("member_id", memberId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (annualError) {
    return fail(annualError.message || "Impossibile caricare la quota annuale.");
  }
  if (!annualQuota?.paid_at) {
    return fail(
      "Quota non trovata o non pagata per questo associato e anno.",
    );
  }

  const sourceId = annualQuota.id;
  const existingId = await findEmessaFiscalReceiptId(client, {
    sourceType: "quota_payment",
    sourceId,
  });
  if (existingId) return ok(existingId);

  const member = await loadMemberPayee(client, memberId);
  if ("error" in member) return fail(member.error);

  const payee = payeeFromMember(member);
  const amountEur = toEur(annualQuota.amount_paid_eur);
  if (amountEur <= 0) {
    return fail("Importo quota non valido per la ricevuta.");
  }

  const issuedOn = annualQuota.paid_at.slice(0, 10) || todayInRome();
  const created = await insertReceiptWithLines(client, {
    issuedOn,
    paymentId: null,
    sourceType: "quota_payment",
    sourceId,
    memberId,
    payeeName: payee.payeeName,
    payeeTaxCode: payee.payeeTaxCode,
    payeeEmail: payee.payeeEmail,
    amountEur,
    method: "carta",
    lines: [
      {
        description: `Quota associativa ${fiscalYear}`,
        amountEur,
      },
    ],
    createdBy: input.actorMemberId ?? null,
    pdfBase64: input.pdfBase64 ?? null,
  });
  if ("error" in created) return fail(created.error);
  return ok(created.id);
}

export async function emitFiscalReceiptForCreditPurchase(
  client: ReceiptsClient,
  input: {
    purchaseId: string;
    actorMemberId?: string | null;
    pdfBase64?: string | null;
  },
): Promise<CourseMutationResult> {
  const purchaseId = input.purchaseId.trim();
  if (!purchaseId) return fail("Manca l'acquisto crediti.");

  const existingId = await findEmessaFiscalReceiptId(client, {
    sourceType: "credit_shop",
    sourceId: purchaseId,
  });
  if (existingId) return ok(existingId);

  const { data: purchase, error: purchaseError } = await client
    .from("credit_purchases")
    .select(
      "id, member_id, package_id, credits_granted, amount_paid_eur, payment_status, payment_method, paid_on, created_at",
    )
    .eq("id", purchaseId)
    .maybeSingle();
  if (purchaseError) {
    return fail(purchaseError.message || "Impossibile caricare l'acquisto crediti.");
  }
  if (!purchase) return fail("Acquisto crediti non trovato.");
  if (purchase.payment_status !== "paid") {
    return fail("L'acquisto crediti non è pagato.");
  }

  const amountEur = toEur(purchase.amount_paid_eur);
  if (amountEur <= 0) {
    return fail("Importo zero: nessuna ricevuta fiscale.");
  }

  const member = await loadMemberPayee(client, purchase.member_id);
  if ("error" in member) return fail(member.error);

  let title = "Acquisto crediti";
  if (purchase.package_id) {
    const { data: pkg, error: pkgError } = await client
      .from("credit_packages")
      .select("name")
      .eq("id", purchase.package_id)
      .maybeSingle();
    if (pkgError) {
      return fail(pkgError.message || "Impossibile caricare il pacchetto crediti.");
    }
    const name = pkg?.name?.trim();
    title = name ? `Pacchetto crediti ${name}` : "Pacchetto crediti";
  }

  const payee = payeeFromMember(member);
  const issuedOn =
    purchase.paid_on?.slice(0, 10) ||
    purchase.created_at?.slice(0, 10) ||
    todayInRome();

  const created = await insertReceiptWithLines(client, {
    issuedOn,
    paymentId: null,
    sourceType: "credit_shop",
    sourceId: purchase.id,
    memberId: purchase.member_id,
    payeeName: payee.payeeName,
    payeeTaxCode: payee.payeeTaxCode,
    payeeEmail: payee.payeeEmail,
    amountEur,
    method: purchase.payment_method || "nexi",
    lines: [
      {
        description: `${title} — ${formatCreditsCount(purchase.credits_granted)}`,
        amountEur,
      },
    ],
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
    section?: string | "all";
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
  if (options?.section && options.section !== "all") {
    const sections = fiscalReceiptSectionFilterCodes(
      options.section as FiscalReceiptSectionCode,
    );
    query = query.in("section", sections);
  }
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

export async function voidFiscalReceipt(
  client: ReceiptsClient,
  input: { receiptId: string },
): Promise<CourseMutationResult> {
  const receiptId = input.receiptId.trim();
  if (!receiptId) return fail("Manca la ricevuta.");

  const receipt = await getFiscalReceipt(client, receiptId);
  if (!receipt) return fail("Ricevuta non trovata.");
  if (receipt.status !== "emessa") {
    return fail("Si può annullare solo una ricevuta emessa.");
  }

  const { error } = await client
    .from("fiscal_receipts")
    .update({ status: "annullata" })
    .eq("id", receiptId)
    .eq("status", "emessa");
  if (error) {
    return fail(error.message || "Impossibile annullare la ricevuta.");
  }
  return ok(receiptId);
}

export async function updateFiscalReceipt(
  client: ReceiptsClient,
  input: {
    receiptId: string;
    payeeName?: string;
    payeeTaxCode?: string | null;
    payeeEmail?: string | null;
    amountEur?: number;
    issuedOn?: string;
    method?: string;
    lines?: ReceiptLineInput[];
  },
): Promise<CourseMutationResult> {
  const receiptId = input.receiptId.trim();
  if (!receiptId) return fail("Manca la ricevuta.");

  const receipt = await getFiscalReceipt(client, receiptId);
  if (!receipt) return fail("Ricevuta non trovata.");
  if (receipt.status !== "emessa") {
    return fail(
      "Si può modificare solo una ricevuta emessa. Per correzioni strutturali usa lo storno (replace).",
    );
  }

  const patch: Database["public"]["Tables"]["fiscal_receipts"]["Update"] = {};
  if (input.payeeName !== undefined) {
    const name = input.payeeName.trim();
    if (!name) return fail("Intestatario obbligatorio.");
    patch.payee_name = name;
  }
  if (input.payeeTaxCode !== undefined) {
    patch.payee_tax_code = emptyToNull(input.payeeTaxCode);
  }
  if (input.payeeEmail !== undefined) {
    patch.payee_email = emptyToNull(input.payeeEmail);
  }
  if (input.amountEur !== undefined) {
    const amount = toEur(input.amountEur);
    if (amount < 0) return fail("Importo non valido.");
    patch.amount_eur = amount;
  }
  if (input.issuedOn !== undefined) {
    const issuedOn = input.issuedOn.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)) {
      return fail("Data emissione non valida.");
    }
    patch.issued_on = issuedOn;
  }
  if (input.method !== undefined) {
    const method = input.method.trim();
    if (!method) return fail("Metodo di pagamento obbligatorio.");
    patch.method = method;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await client
      .from("fiscal_receipts")
      .update(patch)
      .eq("id", receiptId)
      .eq("status", "emessa");
    if (error) {
      return fail(error.message || "Impossibile aggiornare la ricevuta.");
    }
  }

  if (input.lines) {
    const { error: deleteError } = await client
      .from("fiscal_receipt_lines")
      .delete()
      .eq("receipt_id", receiptId);
    if (deleteError) {
      return fail(deleteError.message || "Impossibile aggiornare le righe.");
    }
    if (input.lines.length > 0) {
      const { error: linesError } = await client
        .from("fiscal_receipt_lines")
        .insert(
          input.lines.map((line, index) => ({
            receipt_id: receiptId,
            description: line.description,
            amount_eur: line.amountEur,
            sort_order: index,
          })),
        );
      if (linesError) {
        return fail(linesError.message || "Impossibile salvare le righe.");
      }
    }
  }

  return ok(receiptId);
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

  const bodyWithoutSignoff = [
    "Ciao,",
    "",
    `in allegato la copia della ricevuta ${receipt.code} di MusicPro School.`,
  ].join("\n");
  const textBody = [
    bodyWithoutSignoff,
    "",
    "Grazie,",
    "MusicPro School",
    schoolEmailTextFooter(),
  ].join("\n");
  const html = wrapSchoolEmail({
    appOrigin: SCHOOL_APP_URL,
    title: "Ricevuta",
    htmlBody: schoolEmailBodyFromText(bodyWithoutSignoff),
    ctas: [
      {
        href: `${SCHOOL_APP_URL}/dashboard`,
        label: "Apri l'area personale",
      },
    ],
  });

  const result = await sendLessonFamilyEmail(client, receipt.memberId, {
    subject: `Ricevuta ${receipt.code} — MusicPro School`,
    body: textBody,
    html,
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

  const sourceType = old.sourceType ?? "lesson_pack";
  const sourceId = old.sourceId ?? old.paymentId ?? old.id;

  const created = await insertReceiptWithLines(client, {
    issuedOn: todayInRome(),
    paymentId: old.paymentId,
    sourceType,
    sourceId,
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

function fiscalReceiptExportRows(rows: FiscalReceiptRow[]): string[][] {
  const header = [
    "sezione",
    "numero",
    "data",
    "intestatario",
    "CF",
    "importo",
    "causale",
    "metodo",
  ];
  const dataRows = rows.map((row) => [
    row.section,
    row.code,
    formatCsvDate(row.issuedOn),
    row.payeeName,
    row.payeeTaxCode ?? "",
    formatCsvEuro(row.amountEur),
    row.lines.map((line) => line.description).join(" + ") ||
      "Pacchetto lezioni",
    row.method,
  ]);
  return [header, ...dataRows];
}

export function fiscalReceiptsCsv(rows: FiscalReceiptRow[]): string {
  const table = fiscalReceiptExportRows(rows);
  return table
    .map((cells) => cells.map((cell) => csvEscape(cell)).join(";"))
    .join("\n");
}

/** Tab-separated export (apribile come .xls in Excel). */
export function fiscalReceiptsXls(rows: FiscalReceiptRow[]): string {
  const table = fiscalReceiptExportRows(rows);
  return table.map((cells) => cells.join("\t")).join("\n");
}
