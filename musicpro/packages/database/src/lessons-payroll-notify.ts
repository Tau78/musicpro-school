import type { SupabaseClient } from "@supabase/supabase-js";

import { todayInRome } from "./bookings";
import {
  addMonths,
  getLessonPayroll,
  listLessonPayrolls,
} from "./lessons-payroll";
import { getLessonSchoolSettings } from "./lessons-settings";
import { sendSingleEmail } from "./messaging";
import type { Database } from "./types/database";

type NotifyClient = SupabaseClient<Database>;

const MONTH_NAMES_IT = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const REMINDER_COOLDOWN_MS = 20 * 60 * 60 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function monthLabel(year: number, month: number): string {
  const name = MONTH_NAMES_IT[month - 1] ?? String(month);
  return `${name} ${year}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  const next = addMonths(year, month, 1);
  return addDaysIso(`${next.year}-${pad2(next.month)}-01`, -1);
}

function signDeadlineOn(
  year: number,
  month: number,
  deadlineDays: number,
): string {
  return addDaysIso(lastDayOfMonth(year, month), Math.max(0, deadlineDays));
}

function generatedWithinCooldown(generatedAt: string | null | undefined): boolean {
  if (!generatedAt) return false;
  const ts = Date.parse(generatedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < REMINDER_COOLDOWN_MS;
}

async function teacherEmail(
  client: NotifyClient,
  memberId: string,
): Promise<{ email: string; firstName: string } | null> {
  const { data, error } = await client
    .from("members")
    .select("email, first_name")
    .eq("id", memberId)
    .maybeSingle();
  if (error || !data) return null;
  const email = data.email?.trim() ?? "";
  if (!email) return null;
  return { email, firstName: data.first_name?.trim() || "Docente" };
}

export async function notifyLessonPayrollDraft(
  client: NotifyClient,
  payrollId: string,
): Promise<{ ok: boolean; error?: string }> {
  const payroll = await getLessonPayroll(client, payrollId);
  if (!payroll) {
    return { ok: false, error: "Notula non trovata." };
  }
  const teacher = await teacherEmail(client, payroll.teacherMemberId);
  if (!teacher) {
    return { ok: false, error: "Email docente mancante." };
  }

  const period = monthLabel(payroll.year, payroll.month);
  const subject = `Notula didattica ${period} da firmare`;
  const body = [
    `Ciao ${teacher.firstName},`,
    "",
    `è pronta la notula didattica di ${period}.`,
    "Apri Lezioni → Notule, controlla le ore e firma (o carica la fattura).",
    "",
    "Grazie,",
    "MusicPro School",
  ].join("\n");

  const result = await sendSingleEmail(client, {
    to: teacher.email,
    subject,
    body,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

export async function sendDuePayrollSignReminders(
  client: NotifyClient,
): Promise<{ reminded: number; errors: string[] }> {
  const errors: string[] = [];
  let reminded = 0;

  let deadlineDays = 10;
  let jobDay = 8;
  try {
    const settings = await getLessonSchoolSettings(client);
    deadlineDays = settings?.notulaSignDeadlineDays ?? 10;
    jobDay = settings?.notulaJobDay ?? 8;
  } catch (err) {
    errors.push(
      err instanceof Error
        ? err.message
        : "Impossibile caricare le impostazioni notula.",
    );
    return { reminded, errors };
  }

  const today = todayInRome();
  if (Number(today.slice(8, 10)) !== jobDay) {
    return { reminded, errors };
  }
  const drafts = await listLessonPayrolls(client, { status: "draft" });

  for (const payroll of drafts) {
    const deadline = signDeadlineOn(
      payroll.year,
      payroll.month,
      deadlineDays,
    );
    if (today < deadline) continue;
    if (generatedWithinCooldown(payroll.generatedAt)) continue;

    const teacher = await teacherEmail(client, payroll.teacherMemberId);
    if (!teacher) {
      errors.push(
        `Notula ${payroll.year}-${pad2(payroll.month)}: email docente mancante.`,
      );
      continue;
    }

    const period = monthLabel(payroll.year, payroll.month);
    const subject = `Sollecito: notula didattica ${period} da firmare`;
    const body = [
      `Ciao ${teacher.firstName},`,
      "",
      `la notula didattica di ${period} è ancora da firmare. La scadenza è passata.`,
      "Apri Lezioni → Notule e firma (o carica la fattura).",
      "",
      "MusicPro School",
    ].join("\n");

    const result = await sendSingleEmail(client, {
      to: teacher.email,
      subject,
      body,
    });
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    reminded += 1;
  }

  return { reminded, errors };
}
