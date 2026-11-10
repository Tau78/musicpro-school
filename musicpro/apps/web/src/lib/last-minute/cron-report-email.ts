import type { PublishDigestStoriesResult } from "@/lib/queue-school-lm-story-to-eventi";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@musicpro/database";

export type CronReportPayload = {
  dayRome: string;
  success: boolean;
  skipped?: boolean;
  reason?: string;
  message?: string;
  operationalActive?: boolean;
  roomsScanned?: number;
  candidates?: number;
  phase1Created?: number;
  phase2Advanced?: number;
  digest?: PublishDigestStoriesResult | null;
  eventiCredsPresent: boolean;
};

async function staffReportEmails(
  client: SupabaseClient<Database>,
): Promise<string[]> {
  const { data, error } = await client
    .from("app_settings")
    .select("key, value")
    .in("key", ["admin_email", "segreteria_email"]);

  if (error) {
    console.warn("[last-minute-report] staff emails:", error.message);
    return [];
  }

  const emails = new Set<string>();
  for (const row of data ?? []) {
    const value = typeof row.value === "string" ? row.value.trim() : "";
    if (value.includes("@")) emails.add(value.toLowerCase());
  }
  return [...emails];
}

function formatDigestLines(
  digest: PublishDigestStoriesResult | null | undefined,
): string[] {
  if (!digest) return ["Digest storie: non eseguito."];
  if (digest.skipped && digest.reason) {
    return [`Digest storie: saltato (${digest.reason}).`];
  }
  if (!digest.success && digest.reason) {
    return [`Digest storie: errore (${digest.reason}).`];
  }
  const dayErrors = digest.days?.filter((d) => d.action === "error") ?? [];
  if (dayErrors.length > 0) {
    const lines = ["Digest storie: errori su alcuni giorni:"];
    for (const day of dayErrors) {
      lines.push(
        `  · ${day.dayRome} | ${day.message?.slice(0, 160) ?? "errore"}`,
      );
    }
    return lines;
  }
  if (!digest.days?.length) {
    return ["Digest storie: nessun giorno con campagne in finestra 48h."];
  }
  return [
    "Digest storie:",
    ...digest.days.map((day) => {
      const parts = [
        `${day.dayRome}`,
        day.action,
        day.planId ? `plan=${day.planId.slice(0, 8)}…` : null,
        day.message ? day.message.slice(0, 120) : null,
      ].filter(Boolean);
      return `  · ${parts.join(" | ")}`;
    }),
  ];
}

export function reportEmailSubjectSuffix(payload: CronReportPayload): string {
  if (payload.skipped) return "saltato";
  if (!payload.success) return "errore";
  const digest = payload.digest;
  if (digest && !digest.success && digest.reason) return "avvisi";
  if (digest?.skipped && digest.reason) return "avvisi";
  if (digest?.days?.some((d) => d.action === "error")) return "avvisi";
  return "ok";
}

function shouldShowRunStats(payload: CronReportPayload): boolean {
  if (!payload.skipped && payload.success) return true;
  return (
    (payload.phase1Created ?? 0) > 0 ||
    (payload.phase2Advanced ?? 0) > 0 ||
    (payload.candidates ?? 0) > 0 ||
    (payload.roomsScanned ?? 0) > 0
  );
}

export async function sendLastMinuteCronReportEmail(
  client: SupabaseClient<Database>,
  payload: CronReportPayload,
): Promise<{ sent: boolean; error?: string }> {
  const to = await staffReportEmails(client);
  if (!to.length) {
    return { sent: false, error: "Nessuna admin_email / segreteria_email in app_settings" };
  }

  const lines: string[] = [
    "Report automatico cron Last minute — MusicPro School",
    "",
    `Giorno (Roma): ${payload.dayRome}`,
    payload.skipped
      ? `Esito: saltato (${payload.reason ?? "n/d"})`
      : payload.success
        ? "Esito: completato"
        : `Esito: errore — ${payload.message ?? "n/d"}`,
    "",
    `Serata operativa attiva oggi: ${payload.operationalActive === true ? "sì" : payload.operationalActive === false ? "no" : "n/d"}`,
    `Credenziali Eventi su Vercel: ${payload.eventiCredsPresent ? "presenti" : "MANCANTI (digest non accodato)"}`,
    "",
  ];

  if (payload.message && (payload.skipped || !payload.success)) {
    lines.push(`Dettaglio: ${payload.message}`, "");
  }

  if (shouldShowRunStats(payload)) {
    lines.push(
      `Sale scansionate: ${payload.roomsScanned ?? 0}`,
      `Slot candidati (ancorati in fascia): ${payload.candidates ?? 0}`,
      `Campagne phase1 create: ${payload.phase1Created ?? 0}`,
      `Avanzamenti a phase2: ${payload.phase2Advanced ?? 0}`,
      "",
    );
  }

  lines.push(...formatDigestLines(payload.digest));
  lines.push(
    "",
    "Azione: se le storie sono «queued», pubblica da Eventi. Se «eventi_creds_missing», aggiungi EVENTI_SUPABASE_* su Vercel.",
    "",
    "— https://school.musicproeventi.it/admin/impostazioni",
  );

  const text = lines.join("\n");
  const html = lines.map((line) => escapeHtml(line)).join("<br />\n");
  const subjectSuffix = reportEmailSubjectSuffix(payload);

  const mail = await sendEnrollmentEmail({
    to,
    subject: `[School LM] ${payload.dayRome} — ${subjectSuffix}`,
    text,
    html,
    preferGoogleSmtp: true,
    timeoutMs: 12_000,
  });

  return mail.sent ? { sent: true } : { sent: false, error: mail.error };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
