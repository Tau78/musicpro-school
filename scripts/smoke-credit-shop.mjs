#!/usr/bin/env node
/**
 * Smoke test — SHOP crediti (migration 011 + RPC).
 * Usage: node scripts/smoke-credit-shop.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, "musicpro/.env"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("FAIL: Supabase URL o service role mancanti");
  process.exit(1);
}

const service = createClient(supabaseUrl, serviceKey);

function ok(msg) {
  console.log(`OK  ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

console.log("Smoke test — SHOP crediti\n");

const { data: packages, error: pkgErr } = await service
  .from("credit_packages")
  .select("id, name, credits, enabled")
  .order("sort_order");

if (pkgErr) fail(`credit_packages: ${pkgErr.message}`);
else ok(`credit_packages — ${packages?.length ?? 0} pacchetti (${packages?.filter((p) => p.enabled).length ?? 0} attivi)`);

const { data: member } = await service
  .from("members")
  .select("id, first_name, last_name")
  .eq("is_active", true)
  .limit(1)
  .maybeSingle();

if (!member) {
  console.log("SKIP balance — nessun membro attivo");
} else {
  const { data: balance, error: balErr } = await service.rpc("get_member_credit_balance", {
    p_member_id: member.id,
  });
  if (balErr) fail(`get_member_credit_balance: ${balErr.message}`);
  else {
    const b = balance ?? {};
    ok(
      `saldo ${member.first_name} — disponibili ${b.available ?? 0}, bloccati ${b.held ?? 0}, totale ${b.total ?? 0}`,
    );
  }

  const { data: adj, error: adjErr } = await service.rpc("admin_adjust_member_credits", {
    p_member_id: member.id,
    p_amount: 0,
    p_reason: "Smoke test — verifica RPC (importo 0)",
  });
  if (adjErr && !adjErr.message.includes("admin")) {
    fail(`admin_adjust_member_credits: ${adjErr.message}`);
  } else if (adjErr) {
    console.log("SKIP admin_adjust — richiede sessione admin (RPC ok lato schema)");
  } else {
    ok("admin_adjust_member_credits — RPC risponde");
  }
}

const { data: active, error: listErr } = await service.rpc("list_active_credit_packages");
if (listErr) fail(`list_active_credit_packages: ${listErr.message}`);
else ok(`list_active_credit_packages — ${Array.isArray(active) ? active.length : 0} attivi`);

if (member) {
  const { data: room } = await service
    .from("rooms")
    .select("id")
    .eq("is_active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();

  if (!room) {
    console.log("SKIP debit confirm — nessuna sala attiva");
  } else {
    const start = "2099-12-16T21:00:00.000Z";
    const end = "2099-12-16T22:00:00.000Z";
    await service.from("bookings").delete().eq("room_id", room.id).eq("start_at", start);

    const { data: creditRow, error: creditErr } = await service
      .from("credit_transactions")
      .insert({
        member_id: member.id,
        amount: 1,
        type: "adjustment",
        reason: "SMOKE TEST debit confirm",
      })
      .select("id")
      .single();

    if (creditErr || !creditRow) {
      console.log(`SKIP debit confirm — insert credito: ${creditErr?.message ?? "nessuna riga"}`);
    } else {
      const { data: booking, error: insErr } = await service
        .from("bookings")
        .insert({
          room_id: room.id,
          member_id: member.id,
          start_at: start,
          end_at: end,
          status: "pending",
          payment_status: "unpaid",
          duration_minutes: 60,
          title: "SMOKE TEST debit credits",
          notes: "SMOKE TEST debit credits — auto-cleanup",
        })
        .select("id")
        .single();

      if (insErr || !booking) {
        fail(`debit confirm insert: ${insErr?.message ?? "nessuna riga"}`);
      } else {
        const { data: debit, error: debitErr } = await service.rpc("debit_booking_credits", {
          p_booking_id: booking.id,
          p_credits: 1,
        });
        const { data: paid } = await service
          .from("bookings")
          .select("status, payment_status, payment_method")
          .eq("id", booking.id)
          .maybeSingle();

        if (debitErr) fail(`debit_booking_credits: ${debitErr.message}`);
        else if (paid?.status === "confirmed" && paid.payment_status === "not_required") {
          ok(`debit confirm — ${paid.status}/${paid.payment_status} method=${paid.payment_method}`);
        } else {
          fail(
            `debit confirm atteso confirmed/not_required, ottenuto ${paid?.status}/${paid?.payment_status} rpc=${JSON.stringify(debit)}`,
          );
        }

        await service.from("bookings").delete().eq("id", booking.id);
        await service
          .from("credit_transactions")
          .delete()
          .or(`reason.eq.SMOKE TEST debit confirm,reason.eq.Addebito crediti prenotazione ${booking.id}`);
      }

      if (insErr) {
        await service.from("credit_transactions").delete().eq("id", creditRow.id);
      }
    }
  }
}

console.log(process.exitCode ? "\nSmoke test FAILED" : "\nSmoke test PASSED");
