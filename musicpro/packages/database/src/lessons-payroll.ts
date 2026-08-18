import type { SupabaseClient } from "@supabase/supabase-js";

import { getRomeDayBoundsUtc, todayInRome } from "./bookings";
import type { CourseMutationResult } from "./courses";
import { getLessonSchoolSettings } from "./lessons-settings";
import type { Database } from "./types/database";

type PayrollClient = SupabaseClient<Database>;

export type LessonPayrollStatus = "draft" | "signed" | "closed";
export type LessonPayrollLineKind =
  | "insegnamento"
  | "coordinamento"
  | "extra"
  | "anticipo"
  | "riporto";

export type LessonPayrollLine = {
  id?: string;
  kind: LessonPayrollLineKind;
  lessonId: string | null;
  courseId: string | null;
  occurredOn: string | null;
  description: string;
  minutes: number;
  quantity: number;
  unitEur: number;
  amountEur: number;
  sortOrder: number;
  isManual: boolean;
};

export type LessonPayroll = {
  id: string;
  teacherMemberId: string;
  teacherLabel: string;
  year: number;
  month: number;
  status: LessonPayrollStatus;
  grossEur: number;
  advancesEur: number;
  carryInEur: number;
  carryOutEur: number;
  withholdingEur: number;
  netEur: number;
  minutesTeaching: number;
  minutesCoordination: number;
  signedAt: string | null;
  hasSignature: boolean;
  hasInvoice: boolean;
  invoiceFilename: string | null;
  closedAt: string | null;
  paidOn: string | null;
  paidMethod: string | null;
  paidNote: string | null;
  generatedAt: string;
  lines: LessonPayrollLine[];
};

export type PayrollPreview = {
  teacherMemberId: string;
  year: number;
  month: number;
  lines: LessonPayrollLine[];
  grossEur: number;
  advancesEur: number;
  carryInEur: number;
  carryOutEur: number;
  netEur: number;
  minutesTeaching: number;
  minutesCoordination: number;
  warnings: string[];
};

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

function memberLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

export function yearMonthFromRomeDate(isoDate: string): {
  year: number;
  month: number;
} {
  const [year, month] = isoDate.slice(0, 10).split("-").map(Number);
  return { year, month };
}

function monthStartDate(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): string {
  const next = addMonths(year, month, 1);
  return addDaysIso(monthStartDate(next.year, next.month), -1);
}

function signDeadlineOn(
  year: number,
  month: number,
  deadlineDays: number,
): string {
  return addDaysIso(lastDayOfMonth(year, month), Math.max(0, deadlineDays));
}

function dateInRome(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function coversDate(
  startsOn: string,
  endsOn: string | null,
  day: string,
): boolean {
  if (startsOn > day) return false;
  if (endsOn && endsOn < day) return false;
  return true;
}

async function isStaffMember(
  client: PayrollClient,
  memberId: string,
): Promise<boolean> {
  const { data } = await client
    .from("member_roles")
    .select("role")
    .eq("member_id", memberId)
    .is("revoked_at", null);
  return (data ?? []).some(
    (row) => row.role === "admin" || row.role === "segreteria",
  );
}

export async function isPayrollMonthClosed(
  client: PayrollClient,
  teacherMemberId: string,
  romeDate: string,
): Promise<boolean> {
  const { year, month } = yearMonthFromRomeDate(romeDate);
  const { data } = await client
    .from("lesson_payrolls")
    .select("status")
    .eq("teacher_member_id", teacherMemberId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  return data?.status === "closed";
}

async function teacherLabelFor(
  client: PayrollClient,
  memberId: string,
): Promise<string> {
  const { data } = await client
    .from("members")
    .select("first_name, last_name")
    .eq("id", memberId)
    .maybeSingle();
  if (!data) return "Docente";
  return memberLabel(data.last_name, data.first_name);
}

async function previousCarryOut(
  client: PayrollClient,
  teacherMemberId: string,
  year: number,
  month: number,
): Promise<number> {
  const prev = addMonths(year, month, -1);
  const { data } = await client
    .from("lesson_payrolls")
    .select("carry_out_eur")
    .eq("teacher_member_id", teacherMemberId)
    .eq("year", prev.year)
    .eq("month", prev.month)
    .maybeSingle();
  return toEur(data?.carry_out_eur);
}

async function computePreview(
  client: PayrollClient,
  teacherMemberId: string,
  year: number,
  month: number,
  persistSlips = false,
): Promise<PayrollPreview> {
  const warnings: string[] = [];
  const settings = await getLessonSchoolSettings(client);
  const deadlineDays = settings?.notulaSignDeadlineDays ?? 10;
  const pastDeadline = todayInRome() >= signDeadlineOn(year, month, deadlineDays);

  const monthStart = monthStartDate(year, month);
  const next = addMonths(year, month, 1);
  const { startUtc } = getRomeDayBoundsUtc(monthStart);
  const { startUtc: endUtc } = getRomeDayBoundsUtc(
    monthStartDate(next.year, next.month),
  );

  const { data: slipRows } = await client
    .from("lesson_payroll_slips")
    .select("lesson_id, to_year, to_month")
    .eq("to_year", year)
    .eq("to_month", month);
  const slippedIn = new Set((slipRows ?? []).map((row) => row.lesson_id));

  const { data: lessonRows, error: lessonError } = await client
    .from("lessons")
    .select(
      "id, course_id, starts_at, ends_at, kind, placement, cancelled_at",
    )
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .neq("kind", "prova")
    .gte("starts_at", startUtc)
    .lt("starts_at", endUtc);
  if (lessonError) {
    throw new Error(lessonError.message || "Impossibile caricare le lezioni.");
  }

  const extraIds = [...slippedIn].filter(
    (id) => !(lessonRows ?? []).some((row) => row.id === id),
  );
  let slippedLessons: typeof lessonRows = [];
  if (extraIds.length > 0) {
    const { data } = await client
      .from("lessons")
      .select(
        "id, course_id, starts_at, ends_at, kind, placement, cancelled_at",
      )
      .in("id", extraIds)
      .eq("placement", "scheduled")
      .is("cancelled_at", null)
      .neq("kind", "prova");
    slippedLessons = data ?? [];
  }

  const candidates = [...(lessonRows ?? []), ...(slippedLessons ?? [])];
  const courseIds = [...new Set(candidates.map((row) => row.course_id))];
  const { data: courseRows } = courseIds.length
    ? await client
        .from("courses")
        .select(
          "id, name, course_kind, is_trial, titular_member_id, duration_minutes, counts_as_hour, pay_amount_eur, pay_rate_type_id",
        )
        .in("id", courseIds)
    : { data: [] };

  const courses = new Map((courseRows ?? []).map((row) => [row.id, row]));
  const { data: rateTypes } = await client
    .from("pay_rate_types")
    .select("id, slug, unit, label");
  const rateById = new Map((rateTypes ?? []).map((row) => [row.id, row]));
  const coordType = (rateTypes ?? []).find((row) => row.slug === "coordinamento");

  const { data: teacherRates } = await client
    .from("teacher_pay_rates")
    .select("member_id, pay_rate_type_id, amount_eur")
    .eq("member_id", teacherMemberId);
  const ownRates = new Map(
    (teacherRates ?? []).map((row) => [row.pay_rate_type_id, toEur(row.amount_eur)]),
  );

  const { data: teacherRows } = courseIds.length
    ? await client
        .from("course_teachers")
        .select("course_id, member_id, role, starts_on, ends_on")
        .in("course_id", courseIds)
    : { data: [] };

  const lessonIds = candidates.map((row) => row.id);
  const { data: attendanceRows } = lessonIds.length
    ? await client
        .from("lesson_attendances")
        .select("lesson_id, member_id, status")
        .in("lesson_id", lessonIds)
    : { data: [] };

  const presentByLesson = new Map<string, number>();
  const markedLessons = new Set<string>();
  for (const row of attendanceRows ?? []) {
    markedLessons.add(row.lesson_id);
    if (row.status === "presente") {
      presentByLesson.set(
        row.lesson_id,
        (presentByLesson.get(row.lesson_id) ?? 0) + 1,
      );
    }
  }

  const lines: LessonPayrollLine[] = [];
  let sort = 0;
  let minutesTeaching = 0;
  let minutesCoordination = 0;

  for (const lesson of candidates) {
    const course = courses.get(lesson.course_id);
    if (!course || course.is_trial) continue;
    const day = lesson.starts_at ? dateInRome(lesson.starts_at) : monthStart;
    const inNaturalMonth = lesson.starts_at
      ? lesson.starts_at >= startUtc && lesson.starts_at < endUtc
      : false;
    const assignedHere = slippedIn.has(lesson.id);

    if (!markedLessons.has(lesson.id)) {
      if (persistSlips && inNaturalMonth && pastDeadline) {
        const dest = addMonths(year, month, 1);
        await client.from("lesson_payroll_slips").upsert({
          lesson_id: lesson.id,
          from_year: year,
          from_month: month,
          to_year: dest.year,
          to_month: dest.month,
        });
      }
      continue;
    }
    if (!inNaturalMonth && !assignedHere) continue;

    const present = presentByLesson.get(lesson.id) ?? 0;
    const minutes = course.counts_as_hour
      ? 60
      : course.duration_minutes;
    const hours = minutes / 60;

    const titular =
      (teacherRows ?? []).find(
        (row) =>
          row.course_id === course.id &&
          row.role === "titolare" &&
          coversDate(row.starts_on, row.ends_on, day),
      )?.member_id ?? course.titular_member_id;

    if (titular === teacherMemberId) {
      const unit = course.pay_rate_type_id
        ? rateById.get(course.pay_rate_type_id)?.unit
        : course.course_kind === "gruppo"
          ? "per_head_per_lesson"
          : "hourly";
      const rate = toEur(course.pay_amount_eur);
      if (rate <= 0) {
        warnings.push(`${course.name}: manca la tariffa di insegnamento.`);
      } else if (unit === "per_head_per_lesson") {
        if (present > 0) {
          const amount = toEur(rate * present);
          minutesTeaching += minutes;
          lines.push({
            kind: "insegnamento",
            lessonId: lesson.id,
            courseId: course.id,
            occurredOn: day,
            description: `${course.name} · ${present} present${present === 1 ? "e" : "i"}`,
            minutes,
            quantity: present,
            unitEur: rate,
            amountEur: amount,
            sortOrder: sort++,
            isManual: false,
          });
        }
      } else if (present > 0) {
        const amount = toEur(rate * hours);
        minutesTeaching += minutes;
        lines.push({
          kind: "insegnamento",
          lessonId: lesson.id,
          courseId: course.id,
          occurredOn: day,
          description: course.name,
          minutes,
          quantity: hours,
          unitEur: rate,
          amountEur: amount,
          sortOrder: sort++,
          isManual: false,
        });
      }
    }

    const coordinator = (teacherRows ?? []).find(
      (row) =>
        row.course_id === course.id &&
        row.role === "coordinatore" &&
        coversDate(row.starts_on, row.ends_on, day),
    );
    if (coordinator?.member_id === teacherMemberId && present > 0) {
      const coordRate = coordType ? ownRates.get(coordType.id) ?? 0 : 0;
      if (coordRate <= 0) {
        warnings.push(`${course.name}: manca la tariffa Coordinamento.`);
      } else {
        const amount = toEur(coordRate * hours);
        minutesCoordination += minutes;
        lines.push({
          kind: "coordinamento",
          lessonId: lesson.id,
          courseId: course.id,
          occurredOn: day,
          description: `Coordinamento · ${course.name}`,
          minutes,
          quantity: hours,
          unitEur: coordRate,
          amountEur: amount,
          sortOrder: sort++,
          isManual: false,
        });
      }
    }
  }

  const { data: advances } = await client
    .from("teacher_cash_advances")
    .select("id, amount_eur, payroll_id, status")
    .eq("teacher_member_id", teacherMemberId)
    .eq("status", "confirmed")
    .is("payroll_id", null);

  const advancesEur = toEur(
    (advances ?? []).reduce((sum, row) => sum + toEur(row.amount_eur), 0),
  );
  if (advancesEur > 0) {
    lines.push({
      kind: "anticipo",
      lessonId: null,
      courseId: null,
      occurredOn: null,
      description: "Anticipo docente (contanti)",
      minutes: 0,
      quantity: 1,
      unitEur: -advancesEur,
      amountEur: -advancesEur,
      sortOrder: sort++,
      isManual: false,
    });
  }

  const carryInEur = await previousCarryOut(client, teacherMemberId, year, month);
  if (carryInEur > 0) {
    lines.push({
      kind: "riporto",
      lessonId: null,
      courseId: null,
      occurredOn: null,
      description: "Riporto anticipi mese precedente",
      minutes: 0,
      quantity: 1,
      unitEur: -carryInEur,
      amountEur: -carryInEur,
      sortOrder: sort++,
      isManual: false,
    });
  }

  const earned = toEur(
    lines
      .filter((line) => line.kind === "insegnamento" || line.kind === "coordinamento")
      .reduce((sum, line) => sum + line.amountEur, 0),
  );
  const remainder = toEur(earned - advancesEur - carryInEur);
  const carryOutEur = remainder < 0 ? toEur(-remainder) : 0;
  const netEur = remainder > 0 ? remainder : 0;

  return {
    teacherMemberId,
    year,
    month,
    lines,
    grossEur: earned,
    advancesEur,
    carryInEur,
    carryOutEur,
    netEur,
    minutesTeaching,
    minutesCoordination,
    warnings,
  };
}

function mapPayroll(
  row: Database["public"]["Tables"]["lesson_payrolls"]["Row"],
  teacherLabel: string,
  lines: LessonPayrollLine[],
): LessonPayroll {
  return {
    id: row.id,
    teacherMemberId: row.teacher_member_id,
    teacherLabel,
    year: row.year,
    month: row.month,
    status: row.status,
    grossEur: toEur(row.gross_eur),
    advancesEur: toEur(row.advances_eur),
    carryInEur: toEur(row.carry_in_eur),
    carryOutEur: toEur(row.carry_out_eur),
    withholdingEur: toEur(row.withholding_eur),
    netEur: toEur(row.net_eur),
    minutesTeaching: row.minutes_teaching,
    minutesCoordination: row.minutes_coordination,
    signedAt: row.signed_at,
    hasSignature: Boolean(row.signature_png_base64),
    hasInvoice: Boolean(row.invoice_uploaded_at || row.invoice_base64),
    invoiceFilename: row.invoice_filename,
    closedAt: row.closed_at,
    paidOn: row.paid_on,
    paidMethod: row.paid_method,
    paidNote: row.paid_note,
    generatedAt: row.generated_at,
    lines,
  };
}

function mapLine(
  row: Database["public"]["Tables"]["lesson_payroll_lines"]["Row"],
): LessonPayrollLine {
  return {
    id: row.id,
    kind: row.kind,
    lessonId: row.lesson_id,
    courseId: row.course_id,
    occurredOn: row.occurred_on,
    description: row.description,
    minutes: row.minutes,
    quantity: toEur(row.quantity),
    unitEur: toEur(row.unit_eur),
    amountEur: toEur(row.amount_eur),
    sortOrder: row.sort_order,
    isManual: row.is_manual,
  };
}

export async function previewLessonPayroll(
  client: PayrollClient,
  teacherMemberId: string,
  year: number,
  month: number,
): Promise<PayrollPreview> {
  return computePreview(client, teacherMemberId, year, month);
}

export async function getLessonPayroll(
  client: PayrollClient,
  payrollId: string,
): Promise<LessonPayroll | null> {
  const { data, error } = await client
    .from("lesson_payrolls")
    .select("*")
    .eq("id", payrollId)
    .maybeSingle();
  if (error || !data) return null;
  const { data: lineRows } = await client
    .from("lesson_payroll_lines")
    .select("*")
    .eq("payroll_id", payrollId)
    .order("sort_order", { ascending: true });
  const label = await teacherLabelFor(client, data.teacher_member_id);
  return mapPayroll(data, label, (lineRows ?? []).map(mapLine));
}

export async function listLessonPayrolls(
  client: PayrollClient,
  options?: {
    teacherMemberId?: string;
    year?: number;
    month?: number;
    status?: LessonPayrollStatus;
  },
): Promise<LessonPayroll[]> {
  let query = client
    .from("lesson_payrolls")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  if (options?.teacherMemberId) {
    query = query.eq("teacher_member_id", options.teacherMemberId);
  }
  if (options?.year) query = query.eq("year", options.year);
  if (options?.month) query = query.eq("month", options.month);
  if (options?.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "Impossibile caricare le notule.");
  }
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const { data: lineRows } = await client
    .from("lesson_payroll_lines")
    .select("*")
    .in("payroll_id", ids)
    .order("sort_order", { ascending: true });
  const linesByPayroll = new Map<string, LessonPayrollLine[]>();
  for (const line of lineRows ?? []) {
    const list = linesByPayroll.get(line.payroll_id) ?? [];
    list.push(mapLine(line));
    linesByPayroll.set(line.payroll_id, list);
  }
  const teacherIds = [...new Set(rows.map((row) => row.teacher_member_id))];
  const { data: members } = await client
    .from("members")
    .select("id, first_name, last_name")
    .in("id", teacherIds);
  const labels = new Map(
    (members ?? []).map((row) => [
      row.id,
      memberLabel(row.last_name, row.first_name),
    ]),
  );
  return rows.map((row) =>
    mapPayroll(
      row,
      labels.get(row.teacher_member_id) ?? "Docente",
      linesByPayroll.get(row.id) ?? [],
    ),
  );
}

async function persistGenerated(
  client: PayrollClient,
  preview: PayrollPreview,
  actorMemberId: string | null,
  withholdingEur: number,
): Promise<CourseMutationResult> {
  const netAfterTax = toEur(Math.max(0, preview.netEur - withholdingEur));
  const { data: existing } = await client
    .from("lesson_payrolls")
    .select("id, status, withholding_eur")
    .eq("teacher_member_id", preview.teacherMemberId)
    .eq("year", preview.year)
    .eq("month", preview.month)
    .maybeSingle();

  if (existing && (existing.status === "signed" || existing.status === "closed")) {
    return fail("La notula è già firmata o chiusa. Sblocca il mese per rigenerarla.");
  }

  let payrollId = existing?.id;
  const withhold = existing ? toEur(existing.withholding_eur) : withholdingEur;

  if (payrollId) {
    const { error } = await client
      .from("lesson_payrolls")
      .update({
        status: "draft",
        gross_eur: preview.grossEur,
        advances_eur: preview.advancesEur,
        carry_in_eur: preview.carryInEur,
        carry_out_eur: preview.carryOutEur,
        withholding_eur: withhold,
        net_eur: toEur(Math.max(0, preview.netEur - withhold)),
        minutes_teaching: preview.minutesTeaching,
        minutes_coordination: preview.minutesCoordination,
        generated_at: new Date().toISOString(),
        generated_by: actorMemberId,
        signed_at: null,
        signature_png_base64: null,
      })
      .eq("id", payrollId);
    if (error) return fail(error.message || "Impossibile aggiornare la notula.");
    await client
      .from("lesson_payroll_lines")
      .delete()
      .eq("payroll_id", payrollId)
      .eq("is_manual", false);
    await client
      .from("teacher_cash_advances")
      .update({ payroll_id: null })
      .eq("payroll_id", payrollId);
  } else {
    const { data: inserted, error } = await client
      .from("lesson_payrolls")
      .insert({
        teacher_member_id: preview.teacherMemberId,
        year: preview.year,
        month: preview.month,
        status: "draft",
        gross_eur: preview.grossEur,
        advances_eur: preview.advancesEur,
        carry_in_eur: preview.carryInEur,
        carry_out_eur: preview.carryOutEur,
        withholding_eur: withhold,
        net_eur: netAfterTax,
        minutes_teaching: preview.minutesTeaching,
        minutes_coordination: preview.minutesCoordination,
        generated_by: actorMemberId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return fail(error?.message || "Impossibile creare la notula.");
    }
    payrollId = inserted.id;
  }

  const { data: extras } = await client
    .from("lesson_payroll_lines")
    .select("amount_eur")
    .eq("payroll_id", payrollId)
    .eq("is_manual", true);
  const extraEur = toEur(
    (extras ?? []).reduce((sum, row) => sum + toEur(row.amount_eur), 0),
  );

  const computed = preview.lines.filter((line) => !line.isManual);
  if (computed.length > 0) {
    const { error: lineError } = await client.from("lesson_payroll_lines").insert(
      computed.map((line) => ({
        payroll_id: payrollId,
        kind: line.kind,
        lesson_id: line.lessonId,
        course_id: line.courseId,
        occurred_on: line.occurredOn,
        description: line.description,
        minutes: line.minutes,
        quantity: line.quantity,
        unit_eur: line.unitEur,
        amount_eur: line.amountEur,
        sort_order: line.sortOrder,
        is_manual: false,
      })),
    );
    if (lineError) {
      return fail(lineError.message || "Notula creata senza dettaglio.", {
        id: payrollId,
      });
    }
  }

  await client
    .from("teacher_cash_advances")
    .update({ payroll_id: payrollId })
    .eq("teacher_member_id", preview.teacherMemberId)
    .eq("status", "confirmed")
    .is("payroll_id", null);

  const grossWithExtra = toEur(preview.grossEur + extraEur);
  const remainder = toEur(
    preview.grossEur + extraEur - preview.advancesEur - preview.carryInEur - withhold,
  );
  const carryOut = remainder < 0 ? toEur(-remainder) : 0;
  const net = remainder > 0 ? remainder : 0;
  await client
    .from("lesson_payrolls")
    .update({
      gross_eur: grossWithExtra,
      carry_out_eur: carryOut,
      net_eur: net,
    })
    .eq("id", payrollId);

  return ok(payrollId, preview.warnings);
}

export async function generateLessonPayroll(
  client: PayrollClient,
  input: {
    teacherMemberId: string;
    year: number;
    month: number;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  if (input.month < 1 || input.month > 12) {
    return fail("Mese non valido.");
  }
  const preview = await computePreview(
    client,
    input.teacherMemberId,
    input.year,
    input.month,
    true,
  );
  return persistGenerated(client, preview, input.actorMemberId, 0);
}

export async function requestLessonPayrollDraft(
  client: PayrollClient,
  input: { teacherMemberId: string; year: number; month: number },
): Promise<CourseMutationResult> {
  const today = todayInRome();
  const { year: cy, month: cm } = yearMonthFromRomeDate(today);
  const currentIdx = cy * 12 + cm;
  const targetIdx = input.year * 12 + input.month;
  if (targetIdx >= currentIdx) {
    return fail("Puoi chiedere la bozza dal 1° del mese successivo.");
  }
  return generateLessonPayroll(client, {
    ...input,
    actorMemberId: input.teacherMemberId,
  });
}

export async function addLessonPayrollExtra(
  client: PayrollClient,
  input: {
    payrollId: string;
    actorMemberId: string;
    description: string;
    amountEur: number;
    occurredOn?: string;
  },
): Promise<CourseMutationResult> {
  const payroll = await getLessonPayroll(client, input.payrollId);
  if (!payroll) return fail("Notula non trovata.");
  if (payroll.status === "closed") {
    return fail("Mese chiuso: sblocca prima di aggiungere extra.");
  }
  const amount = toEur(input.amountEur);
  if (!input.description.trim() || amount === 0) {
    return fail("Descrizione e importo sono obbligatori.");
  }
  const { error } = await client.from("lesson_payroll_lines").insert({
    payroll_id: input.payrollId,
    kind: "extra",
    description: input.description.trim(),
    occurred_on: input.occurredOn ?? null,
    amount_eur: amount,
    unit_eur: amount,
    quantity: 1,
    minutes: 0,
    sort_order: 900 + payroll.lines.length,
    is_manual: true,
  });
  if (error) return fail(error.message || "Impossibile aggiungere l'extra.");
  return generateLessonPayroll(client, {
    teacherMemberId: payroll.teacherMemberId,
    year: payroll.year,
    month: payroll.month,
    actorMemberId: input.actorMemberId,
  });
}

export async function signLessonPayroll(
  client: PayrollClient,
  input: {
    payrollId: string;
    actorMemberId: string;
    signaturePngBase64?: string | null;
    invoiceBase64?: string | null;
    invoiceFilename?: string | null;
  },
): Promise<CourseMutationResult> {
  const payroll = await getLessonPayroll(client, input.payrollId);
  if (!payroll) return fail("Notula non trovata.");
  if (payroll.teacherMemberId !== input.actorMemberId) {
    const staff = await isStaffMember(client, input.actorMemberId);
    if (!staff) return fail("Puoi firmare solo la tua notula.");
  }
  if (payroll.status === "closed") return fail("La notula è già chiusa.");
  const hasSig = Boolean(input.signaturePngBase64?.trim());
  const hasInv = Boolean(input.invoiceBase64?.trim());
  if (!hasSig && !hasInv && !payroll.hasInvoice) {
    return fail("Firma sul canvas oppure carica la fattura.");
  }
  const { error } = await client
    .from("lesson_payrolls")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signature_png_base64: hasSig
        ? input.signaturePngBase64
        : payroll.hasSignature
          ? undefined
          : null,
      invoice_base64: hasInv ? input.invoiceBase64 : undefined,
      invoice_filename: input.invoiceFilename?.trim() || undefined,
      invoice_uploaded_at: hasInv ? new Date().toISOString() : undefined,
    })
    .eq("id", input.payrollId);
  if (error) return fail(error.message || "Impossibile firmare la notula.");
  return ok(input.payrollId);
}

export async function closeLessonPayroll(
  client: PayrollClient,
  input: { payrollId: string; actorMemberId: string },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff può chiudere il mese.");
  const payroll = await getLessonPayroll(client, input.payrollId);
  if (!payroll) return fail("Notula non trovata.");
  if (payroll.status !== "signed") {
    return fail("Si chiude solo una notula firmata (o con fattura).");
  }
  const prev = addMonths(payroll.year, payroll.month, -1);
  const { data: previous } = await client
    .from("lesson_payrolls")
    .select("status")
    .eq("teacher_member_id", payroll.teacherMemberId)
    .eq("year", prev.year)
    .eq("month", prev.month)
    .maybeSingle();
  if (previous && previous.status === "draft") {
    return fail(
      "Prima chiudi (e fai firmare) la notula del mese precedente.",
    );
  }
  const { error } = await client
    .from("lesson_payrolls")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: input.actorMemberId,
    })
    .eq("id", input.payrollId);
  if (error) return fail(error.message || "Impossibile chiudere il mese.");
  return ok(input.payrollId);
}

export async function unlockLessonPayroll(
  client: PayrollClient,
  input: { payrollId: string; actorMemberId: string },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff può sbloccare il mese.");
  const payroll = await getLessonPayroll(client, input.payrollId);
  if (!payroll) return fail("Notula non trovata.");
  await client
    .from("teacher_cash_advances")
    .update({ payroll_id: null })
    .eq("payroll_id", input.payrollId);
  const { error } = await client
    .from("lesson_payrolls")
    .update({
      status: "draft",
      closed_at: null,
      closed_by: null,
      signed_at: null,
      signature_png_base64: null,
    })
    .eq("id", input.payrollId);
  if (error) return fail(error.message || "Impossibile sbloccare il mese.");
  return generateLessonPayroll(client, {
    teacherMemberId: payroll.teacherMemberId,
    year: payroll.year,
    month: payroll.month,
    actorMemberId: input.actorMemberId,
  });
}

export async function setLessonPayrollWithholding(
  client: PayrollClient,
  input: { payrollId: string; actorMemberId: string; withholdingEur: number },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff imposta la ritenuta.");
  const payroll = await getLessonPayroll(client, input.payrollId);
  if (!payroll) return fail("Notula non trovata.");
  if (payroll.status === "closed") return fail("Mese chiuso.");
  const withhold = toEur(input.withholdingEur);
  if (withhold < 0) return fail("La ritenuta non può essere negativa.");
  const remainder = toEur(
    payroll.grossEur - payroll.advancesEur - payroll.carryInEur - withhold,
  );
  const { error } = await client
    .from("lesson_payrolls")
    .update({
      withholding_eur: withhold,
      net_eur: remainder > 0 ? remainder : 0,
      carry_out_eur: remainder < 0 ? toEur(-remainder) : payroll.carryOutEur,
    })
    .eq("id", input.payrollId);
  if (error) return fail(error.message || "Impossibile aggiornare la ritenuta.");
  return ok(input.payrollId);
}

export async function markLessonPayrollPaid(
  client: PayrollClient,
  input: {
    payrollId: string;
    actorMemberId: string;
    paidOn: string;
    paidMethod?: string;
    paidNote?: string;
  },
): Promise<CourseMutationResult> {
  const staff = await isStaffMember(client, input.actorMemberId);
  if (!staff) return fail("Solo lo staff registra il pagamento.");
  const { error } = await client
    .from("lesson_payrolls")
    .update({
      paid_on: input.paidOn,
      paid_method: input.paidMethod?.trim() || null,
      paid_note: input.paidNote?.trim() || null,
    })
    .eq("id", input.payrollId);
  if (error) return fail(error.message || "Impossibile registrare il pagamento.");
  return ok(input.payrollId);
}

export async function generateDueLessonPayrollDrafts(
  client: PayrollClient,
  actorMemberId?: string | null,
): Promise<{ generated: number; errors: string[] }> {
  const today = todayInRome();
  const { year: cy, month: cm } = yearMonthFromRomeDate(today);
  const target = addMonths(cy, cm, -1);
  const settings = await getLessonSchoolSettings(client);
  const jobDay = settings?.notulaJobDay ?? 8;
  const day = Number(today.slice(8, 10));
  if (day < 1) {
    return { generated: 0, errors: [] };
  }

  const { data: teachers } = await client
    .from("course_teachers")
    .select("member_id")
    .is("ends_on", null);
  const ids = new Set((teachers ?? []).map((row) => row.member_id));
  const { data: titulars } = await client
    .from("courses")
    .select("titular_member_id")
    .in("status", ["attivo", "in_pausa", "chiuso"]);
  for (const row of titulars ?? []) ids.add(row.titular_member_id);

  const errors: string[] = [];
  let generated = 0;
  const force = day >= jobDay;
  for (const teacherId of ids) {
    const { data: existing } = await client
      .from("lesson_payrolls")
      .select("id, status")
      .eq("teacher_member_id", teacherId)
      .eq("year", target.year)
      .eq("month", target.month)
      .maybeSingle();
    if (existing && existing.status !== "draft") continue;
    if (existing && !force) continue;
    const result = await generateLessonPayroll(client, {
      teacherMemberId: teacherId,
      year: target.year,
      month: target.month,
      actorMemberId: actorMemberId ?? teacherId,
    });
    if (result.success) generated += 1;
    else if (result.errorMessage) errors.push(result.errorMessage);
  }
  return { generated, errors };
}
