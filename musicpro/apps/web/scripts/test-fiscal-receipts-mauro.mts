/**
 * E2E ricevute TEST (account mauro.andreoni@gmail.com) → email reale.
 *
 *   cd musicpro/apps/web && npx tsx scripts/test-fiscal-receipts-mauro.mts
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  emitFiscalReceiptForPayment,
  emitFiscalReceiptForQuotaPayment,
  emitFiscalReceiptForRoomBooking,
  getFiscalReceipt,
  listFiscalReceipts,
  markFiscalReceiptEmailed,
} from "@musicpro/database";

import { sendEnrollmentEmail } from "../src/lib/iscrizione/email-transport";
import { generateFiscalReceiptPdf } from "../src/lib/lezioni/fiscal-receipt-pdf";
import { bytesToBase64 } from "../src/lib/lezioni/issue-receipt-copy";

const TEST_EMAIL = "mauro.andreoni@gmail.com";
const SANDBOX_ROOM_ID = "1f52cfef-00f2-4580-bc2e-1b3db9583e18";

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(webRoot, "../../..");

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [
          line.slice(0, i),
          line.slice(i + 1).replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

const env = {
  ...readEnvFile(join(repoRoot, ".env")),
  ...readEnvFile(join(repoRoot, "musicpro/.env")),
};

for (const [key, value] of Object.entries(env)) {
  if (value && !process.env[key]) process.env[key] = value;
}

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Mancano SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

if (!env.RESEND_API_KEY?.trim() && !env.GOOGLE_SMTP_USER?.trim()) {
  console.error("Manca RESEND_API_KEY o GOOGLE_SMTP per inviare email");
  process.exit(1);
}

const sendOnly = process.argv.includes("--send-only");

async function emailReceiptToTestInbox(
  receiptId: string,
  code: string,
): Promise<boolean> {
  const row = await getFiscalReceipt(service, receiptId);
  if (!row) return false;
  const pdf = await generateFiscalReceiptPdf(row);
  const delivery = await sendEnrollmentEmail({
    to: [TEST_EMAIL],
    subject: `[TEST] Ricevuta ${code} — MusicPro School`,
    text: [
      "Ciao Mauro,",
      "",
      `test automatico ricevute: in allegato ${code}.`,
      "",
      "MusicPro School",
    ].join("\n"),
    preferGoogleSmtp: true,
    attachments: [
      {
        filename: pdf.filename,
        content: bytesToBase64(pdf.bytes),
        content_type: "application/pdf",
      },
    ],
  });
  if (delivery.sent) {
    await markFiscalReceiptEmailed(service, receiptId);
    return true;
  }
  console.error(`  email error (${code}):`, delivery.error ?? "unknown");
  return false;
}

const service = createClient(url, key);

type StepResult = { label: string; ok: boolean; detail: string };

const results: StepResult[] = [];

function logStep(label: string, ok: boolean, detail: string) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"}  ${label}: ${detail}`);
}

async function main() {
  if (sendOnly) {
    const { data: member } = await service
      .from("members")
      .select("id")
      .ilike("email", TEST_EMAIL)
      .maybeSingle();
    if (!member) process.exit(1);
    const rows = await listFiscalReceipts(service, {
      from: "2026-01-01",
      memberId: member.id,
      includeReplaced: true,
    });
    const testRows = rows.filter(
      (r) => r.section === "TEST" && r.status === "emessa" && !r.emailedAt,
    );
    for (const row of testRows) {
      const sent = await emailReceiptToTestInbox(row.id, row.code);
      logStep(`Invio ${row.code}`, sent, sent ? TEST_EMAIL : "fallito");
    }
    process.exit(results.some((r) => !r.ok) ? 1 : 0);
  }

  const { data: member, error: memberErr } = await service
    .from("members")
    .select("id, email, is_test_account")
    .ilike("email", TEST_EMAIL)
    .maybeSingle();

  if (memberErr || !member) {
    console.error("Member test non trovato");
    process.exit(1);
  }
  if (!member.is_test_account) {
    console.error(`${TEST_EMAIL} non è account test`);
    process.exit(1);
  }
  logStep("Account test", true, `${member.id}`);

  // --- QUOTA (QU → TEST) ---
  let quotaReceiptId: string | null = null;
  const quotaEmit = await emitFiscalReceiptForQuotaPayment(service, {
    memberId: member.id,
    fiscalYear: 2026,
  });
  if (quotaEmit.success && quotaEmit.id) {
    quotaReceiptId = quotaEmit.id;
    const row = await getFiscalReceipt(service, quotaEmit.id);
    logStep("Ricevuta quota", true, row?.code ?? quotaEmit.id);
  } else {
    logStep("Ricevuta quota", false, quotaEmit.errorMessage ?? "errore");
  }

  // --- SALA (SA → TEST): prenotazione pagata su sandbox-test ---
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 14);
  start.setUTCHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  let bookingId: string | null = null;
  const { data: insertedBooking, error: bookingErr } = await service
    .from("bookings")
    .insert({
      room_id: SANDBOX_ROOM_ID,
      member_id: member.id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      status: "confirmed",
      payment_status: "paid",
      payment_method: "nexi",
      total_price_eur: 12.5,
      duration_minutes: 60,
      paid_at: new Date().toISOString(),
      provi_da_solo: true,
      notes: "[TEST] smoke ricevuta SA",
    })
    .select("id")
    .single();

  if (bookingErr) {
    const { data: existing } = await service
      .from("bookings")
      .select("id")
      .eq("member_id", member.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bookingId = existing?.id ?? null;
    logStep(
      "Prenotazione sala test",
      Boolean(bookingId),
      bookingErr.message + (bookingId ? ` — riuso ${bookingId}` : ""),
    );
  } else {
    bookingId = insertedBooking.id;
    logStep("Prenotazione sala test", true, bookingId);
  }

  let roomReceiptId: string | null = null;
  if (bookingId) {
    const roomEmit = await emitFiscalReceiptForRoomBooking(service, {
      bookingId,
    });
    if (roomEmit.success && roomEmit.id) {
      roomReceiptId = roomEmit.id;
      const row = await getFiscalReceipt(service, roomEmit.id);
      logStep("Ricevuta sala", true, row?.code ?? roomEmit.id);
    } else {
      logStep("Ricevuta sala", false, roomEmit.errorMessage ?? "errore");
    }
  }

  // --- LEZIONI (LE → TEST): pagamento pack fittizio ---
  const { data: familyKey, error: fkErr } = await service.rpc(
    "lesson_family_key",
    { p_member_id: member.id },
  );
  if (fkErr || typeof familyKey !== "string") {
    logStep("Pagamento pack test", false, fkErr?.message ?? "family_key");
  } else {
    const { data: payment, error: payErr } = await service
      .from("lesson_pack_payments")
      .insert({
        family_key: familyKey,
        member_id: member.id,
        amount_eur: 60,
        method: "nexi",
        status: "completed",
        paid_on: new Date().toISOString().slice(0, 10),
        note: "[TEST] smoke ricevuta LE",
      })
      .select("id")
      .single();

    if (payErr || !payment) {
      logStep("Pagamento pack test", false, payErr?.message ?? "insert");
    } else {
      logStep("Pagamento pack test", true, payment.id);
      const emitted = await emitFiscalReceiptForPayment(service, {
        paymentId: payment.id,
      });
      if (emitted.success && emitted.id) {
        const row = await getFiscalReceipt(service, emitted.id);
        logStep("Ricevuta lezioni", true, row?.code ?? emitted.id);
      } else {
        logStep("Ricevuta lezioni", false, emitted.errorMessage ?? "errore");
      }
    }
  }

  const receiptIds = [quotaReceiptId, roomReceiptId].filter(Boolean) as string[];
  const latest = await listFiscalReceipts(service, {
    from: "2026-01-01",
    includeReplaced: true,
  });
  for (const row of latest.filter(
    (r) => r.memberId === member.id && r.section === "TEST" && !r.emailedAt,
  )) {
    if (!receiptIds.includes(row.id)) receiptIds.push(row.id);
  }

  for (const id of receiptIds) {
    const row = await getFiscalReceipt(service, id);
    if (!row) continue;
    const sent = await emailReceiptToTestInbox(id, row.code);
    logStep(`Email ${row.code}`, sent, sent ? TEST_EMAIL : "fallito SMTP");
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n---");
  if (failed.length === 0) {
    console.log(`Invio completato verso ${TEST_EMAIL} (controlla inbox).`);
    process.exit(0);
  }
  console.log(`${failed.length} step falliti.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
