import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MEMBER_BOOKING_CONFIRM_SUBJECT,
  processBookingEmail,
} from "@/lib/booking/process-booking-email";

const LOOKBACK_MS = 72 * 60 * 60_000;
const MIN_AFTER_PAYMENT_MS = 90_000;
const MIN_BETWEEN_ATTEMPTS_MS = 5 * 60_000;
const MAX_ATTEMPTS_PER_BOOKING = 8;
const BATCH_LIMIT = 25;

type EmailLogRow = {
  recipient_email: string;
  subject: string;
  status: string;
  created_at: string;
};

type PaidBookingRow = {
  id: string;
  payment_method: string | null;
  total_price_eur: number | null;
  paid_at: string | null;
  updated_at: string;
  members: { email: string | null } | null;
};

export type BookingEmailRetryDecision =
  | { action: "skip"; reason: string }
  | { action: "send"; force: boolean; reason: string };

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function memberLogs(
  logs: EmailLogRow[],
  memberEmail: string,
  subject: string,
): EmailLogRow[] {
  const member = normalizeEmail(memberEmail);
  return logs.filter(
    (row) =>
      normalizeEmail(row.recipient_email).includes(member) &&
      row.subject === subject,
  );
}

function cardPaymentExpectsReceipt(method: string | null): boolean {
  return method === "nexi" || method === "stripe";
}

export function decideBookingEmailRetry(input: {
  nowMs: number;
  memberEmail: string | null | undefined;
  paymentMethod: string | null;
  totalPriceEur: number | null;
  paidAtIso: string | null;
  updatedAtIso: string;
  emailLogs: EmailLogRow[];
  receiptEmailedAt: string | null;
  hasEmessaReceipt: boolean;
}): BookingEmailRetryDecision {
  const memberEmail = String(input.memberEmail ?? "").trim();
  if (!memberEmail) {
    return { action: "skip", reason: "email socio assente" };
  }

  const paidAnchor = input.paidAtIso ?? input.updatedAtIso;
  const paidMs = new Date(paidAnchor).getTime();
  if (!Number.isFinite(paidMs)) {
    return { action: "skip", reason: "data pagamento non valida" };
  }
  if (input.nowMs - paidMs < MIN_AFTER_PAYMENT_MS) {
    return { action: "skip", reason: "attesa post-pagamento" };
  }
  if (input.nowMs - paidMs > LOOKBACK_MS) {
    return { action: "skip", reason: "fuori finestra 72h" };
  }

  const confirmLogs = memberLogs(
    input.emailLogs,
    memberEmail,
    MEMBER_BOOKING_CONFIRM_SUBJECT,
  );
  const sentLogs = confirmLogs.filter((row) => row.status === "sent");
  const attemptLogs = confirmLogs.filter(
    (row) =>
      row.status === "sent" ||
      row.status === "failed" ||
      row.status === "skipped",
  );

  if (attemptLogs.length >= MAX_ATTEMPTS_PER_BOOKING) {
    return { action: "skip", reason: "troppi tentativi" };
  }

  const lastAttemptMs = attemptLogs.length
    ? new Date(attemptLogs[0]!.created_at).getTime()
    : 0;
  if (
    lastAttemptMs > 0 &&
    input.nowMs - lastAttemptMs < MIN_BETWEEN_ATTEMPTS_MS
  ) {
    return { action: "skip", reason: "backoff tra tentativi" };
  }

  if (sentLogs.length === 0) {
    return {
      action: "send",
      force: false,
      reason: "conferma mai inviata con successo",
    };
  }

  const amount = Number(input.totalPriceEur ?? 0);
  if (
    cardPaymentExpectsReceipt(input.paymentMethod) &&
    amount > 0.009 &&
    input.hasEmessaReceipt &&
    !input.receiptEmailedAt
  ) {
    return {
      action: "send",
      force: true,
      reason: "ricevuta emessa ma non marcata inviata per email",
    };
  }

  return { action: "skip", reason: "conferma già ok" };
}

export async function runBookingEmailRetryJob(
  service: SupabaseClient,
): Promise<{
  scanned: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    bookingId: string;
    outcome: string;
    reason: string;
    message?: string;
  }>;
}> {
  const cutoff = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { data: bookings, error } = await service
    .from("bookings")
    .select(
      "id, payment_method, total_price_eur, paid_at, updated_at, members ( email )",
    )
    .eq("status", "confirmed")
    .eq("payment_status", "paid")
    .gte("paid_at", cutoff)
    .order("paid_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(`Prenotazioni: ${error.message}`);
  }

  const rows: PaidBookingRow[] = (bookings ?? []).map((row) => {
    const membersRaw = row.members as
      | { email: string | null }
      | { email: string | null }[]
      | null;
    const members = Array.isArray(membersRaw) ? membersRaw[0] ?? null : membersRaw;
    return {
      id: row.id as string,
      payment_method: row.payment_method as string | null,
      total_price_eur: row.total_price_eur as number | null,
      paid_at: row.paid_at as string | null,
      updated_at: row.updated_at as string,
      members,
    };
  });
  const nowMs = Date.now();
  const details: Array<{
    bookingId: string;
    outcome: string;
    reason: string;
    message?: string;
  }> = [];
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const booking of rows) {
    const bookingId = booking.id;
    const memberEmail = booking.members?.email ?? null;

    const { data: logs, error: logsError } = await service
      .from("booking_email_log")
      .select("recipient_email, subject, status, created_at")
      .eq("booking_id", bookingId)
      .eq("subject", MEMBER_BOOKING_CONFIRM_SUBJECT)
      .order("created_at", { ascending: false });

    if (logsError) {
      errors += 1;
      details.push({
        bookingId,
        outcome: "error",
        reason: "log",
        message: logsError.message,
      });
      continue;
    }

    const { data: receipt } = await service
      .from("fiscal_receipts")
      .select("emailed_at")
      .eq("source_type", "room_booking")
      .eq("source_id", bookingId)
      .eq("status", "emessa")
      .limit(1)
      .maybeSingle();

    const decision = decideBookingEmailRetry({
      nowMs,
      memberEmail,
      paymentMethod: booking.payment_method,
      totalPriceEur: booking.total_price_eur,
      paidAtIso: booking.paid_at,
      updatedAtIso: booking.updated_at,
      emailLogs: (logs ?? []) as EmailLogRow[],
      receiptEmailedAt: receipt?.emailed_at ?? null,
      hasEmessaReceipt: Boolean(receipt),
    });

    if (decision.action === "skip") {
      skipped += 1;
      details.push({
        bookingId,
        outcome: "skip",
        reason: decision.reason,
      });
      continue;
    }

    const result = await processBookingEmail({
      bookingId,
      template: "confirm",
      force: decision.force,
    });

    if (result.success === true && !result.skipped) {
      sent += 1;
      details.push({
        bookingId,
        outcome: "sent",
        reason: decision.reason,
        message: result.message,
      });
    } else if (result.skipped) {
      skipped += 1;
      details.push({
        bookingId,
        outcome: "skipped",
        reason: decision.reason,
        message: result.message,
      });
    } else {
      errors += 1;
      details.push({
        bookingId,
        outcome: "error",
        reason: decision.reason,
        message: result.message,
      });
    }
  }

  return {
    scanned: rows.length,
    sent,
    skipped,
    errors,
    details,
  };
}
