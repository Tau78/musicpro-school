import type { SupabaseClient } from "@supabase/supabase-js";

import { getMemberRoles } from "./auth";
import { todayInRome } from "./bookings";
import type { CourseMutationResult } from "./courses";
import { emitFiscalReceiptForPayment } from "./lessons-receipts";
import { getLessonSchoolSettings } from "./lessons-settings";
import { sendLessonFamilyEmail, sendSingleEmail } from "./messaging";
import { currentFiscalYear } from "./quotas";
import type { Database, Json } from "./types/database";

type WalletClient = SupabaseClient<Database>;

export type LessonFeeKind = "pack" | "quota";
export type LessonFeeStatus = "aperta" | "parziale" | "saldata" | "abbuonata";
export type LessonCreditKind =
  | "saldo_iniziale"
  | "pack"
  | "anticipo_famiglia"
  | "consumo"
  | "rettifica"
  | "spostamento_out"
  | "spostamento_in"
  | "abbuono"
  | "rimborso";

export type LessonFeeRow = {
  id: string;
  courseEnrollmentId: string | null;
  memberId: string;
  courseId: string | null;
  kind: LessonFeeKind;
  status: LessonFeeStatus;
  amountEur: number;
  remainingEur: number;
  dueOn: string;
  lastDunningAt: string | null;
  dunningCount: number;
  note: string | null;
  studentLabel: string;
  tutorLabel: string;
  courseName: string;
  teacherLabel: string;
};

export type EnrollmentWallet = {
  enrollmentId: string;
  courseId: string;
  memberId: string;
  balance: number;
  openingPrepaidLessons: number;
  leftoverEurFamily: number;
};

/** Wallet crediti lezione per associato/tutore (enrollment attivi visibili via RLS). */
export type MemberEnrollmentWallet = {
  enrollmentId: string;
  courseId: string;
  courseName: string;
  memberId: string;
  /** Lezioni residue (somma delta ledger). */
  balance: number;
};

type FeeRow = Database["public"]["Tables"]["lesson_fees"]["Row"];
type EnrollmentRow = Database["public"]["Tables"]["course_enrollments"]["Row"];

type MemberLabelRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  manual_tutor_first_name: string | null;
  manual_tutor_last_name: string | null;
  manual_tutor_email: string | null;
};

type CourseLabelRow = {
  id: string;
  name: string;
  status: string;
  is_trial: boolean;
  price_eur: number;
  titular_member_id: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_QUOTA_EUR = 15;
const DEFAULT_PACK_REMIND_HOURS_1 = 168;
const DEFAULT_PACK_REMIND_HOURS_2 = 24;
const OPEN_FEE_STATUSES: LessonFeeStatus[] = ["aperta", "parziale"];
const MEMBER_LABEL_COLUMNS =
  "id, first_name, last_name, email, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_email";

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

function memberLabel(lastName: string, firstName: string): string {
  return `${lastName} ${firstName}`.trim();
}

function tutorLabel(row: MemberLabelRow): string {
  const last = row.manual_tutor_last_name?.trim() ?? "";
  const first = row.manual_tutor_first_name?.trim() ?? "";
  return memberLabel(last, first);
}

function dunningRecipient(row: MemberLabelRow): string | null {
  const tutor = row.manual_tutor_email?.trim() ?? "";
  if (tutor) return tutor;
  const email = row.email?.trim() ?? "";
  return email || null;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDateIt(isoDate: string): string {
  if (!ISO_DATE_RE.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function rpcFailedMessage(data: Json, fallback: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.success !== false) return null;
  const message = data.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function familyKeyFromMember(row: {
  id: string;
  manual_tutor_email: string | null;
}): string {
  const tutor = row.manual_tutor_email?.trim().toLowerCase() ?? "";
  return tutor ? `tutor:${tutor}` : `member:${row.id}`;
}

async function lessonFamilyKey(
  client: WalletClient,
  memberId: string,
): Promise<{ key: string } | { errorMessage: string }> {
  const { data, error } = await client.rpc("lesson_family_key", {
    p_member_id: memberId,
  });
  if (error) {
    return {
      errorMessage: error.message || "Impossibile calcolare la famiglia.",
    };
  }
  if (typeof data !== "string" || !data.trim()) {
    return { errorMessage: "Famiglia non trovata." };
  }
  return { key: data };
}

async function loadEnrollment(
  client: WalletClient,
  enrollmentId: string,
): Promise<EnrollmentRow | null> {
  const { data, error } = await client
    .from("course_enrollments")
    .select(
      "id, course_id, member_id, opening_prepaid_lessons, left_at, created_at, updated_at",
    )
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare l'iscrizione al corso.",
    );
  }
  return data;
}

async function ledgerBalance(
  client: WalletClient,
  enrollmentId: string,
): Promise<number> {
  const { data, error } = await client
    .from("lesson_credit_ledger")
    .select("delta")
    .eq("course_enrollment_id", enrollmentId);
  if (error) {
    throw new Error(
      error.message || "Impossibile calcolare il saldo crediti lezione.",
    );
  }
  return (data ?? []).reduce((sum, row) => sum + row.delta, 0);
}

async function leftoverForFamilyKey(
  client: WalletClient,
  familyKey: string,
): Promise<number> {
  const { data, error } = await client
    .from("lesson_family_accounts")
    .select("leftover_eur")
    .eq("family_key", familyKey)
    .maybeSingle();
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare l'acconto famiglia.",
    );
  }
  return data ? Number(data.leftover_eur) : 0;
}

async function openPackFeeCount(
  client: WalletClient,
  enrollmentId: string,
): Promise<number> {
  const { count, error } = await client
    .from("lesson_fees")
    .select("id", { count: "exact", head: true })
    .eq("course_enrollment_id", enrollmentId)
    .eq("kind", "pack")
    .in("status", OPEN_FEE_STATUSES);
  if (error) {
    throw new Error(error.message || "Impossibile contare le rette aperte.");
  }
  return count ?? 0;
}

async function insertPackFee(
  client: WalletClient,
  params: {
    enrollmentId: string;
    memberId: string;
    courseId: string;
    amountEur: number;
  },
): Promise<string | { errorMessage: string }> {
  const { data, error } = await client
    .from("lesson_fees")
    .insert({
      course_enrollment_id: params.enrollmentId,
      member_id: params.memberId,
      course_id: params.courseId,
      kind: "pack",
      status: "aperta",
      amount_eur: params.amountEur,
      remaining_eur: params.amountEur,
      due_on: todayInRome(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      errorMessage: error?.message || "Impossibile aprire la retta pack.",
    };
  }
  return data.id;
}

async function loadMembersById(
  client: WalletClient,
  ids: string[],
): Promise<Map<string, MemberLabelRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, MemberLabelRow>();
  if (unique.length === 0) return map;
  const { data, error } = await client
    .from("members")
    .select(MEMBER_LABEL_COLUMNS)
    .in("id", unique);
  if (error) {
    throw new Error(error.message || "Impossibile caricare gli associati.");
  }
  for (const row of data ?? []) {
    map.set(row.id, row as MemberLabelRow);
  }
  return map;
}

async function resolveQuotaAmountEur(
  client: WalletClient,
  memberId: string,
): Promise<number> {
  const year = currentFiscalYear();
  const [settingRes, enrollmentRes] = await Promise.all([
    client
      .from("annual_quota_settings")
      .select("amount_eur")
      .eq("fiscal_year", year)
      .maybeSingle(),
    client
      .from("enrollments")
      .select("amount_centesimi")
      .eq("member_id", memberId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const fromEnrollment =
    enrollmentRes.data && Number(enrollmentRes.data.amount_centesimi) > 0
      ? Number(enrollmentRes.data.amount_centesimi) / 100
      : 0;
  if (fromEnrollment > 0) return fromEnrollment;

  const fromSetting =
    settingRes.data && Number(settingRes.data.amount_eur) > 0
      ? Number(settingRes.data.amount_eur)
      : 0;
  if (fromSetting > 0) return fromSetting;

  return DEFAULT_QUOTA_EUR;
}

async function hasActiveNonTrialCourse(
  client: WalletClient,
  memberId: string,
): Promise<boolean> {
  const { data: enrollments, error: enrollError } = await client
    .from("course_enrollments")
    .select("course_id")
    .eq("member_id", memberId)
    .is("left_at", null);
  if (enrollError) {
    throw new Error(
      enrollError.message || "Impossibile verificare i corsi dell'allievo.",
    );
  }
  const courseIds = [...new Set((enrollments ?? []).map((row) => row.course_id))];
  if (courseIds.length === 0) return false;

  const { data: courses, error: courseError } = await client
    .from("courses")
    .select("id")
    .in("id", courseIds)
    .eq("status", "attivo")
    .eq("is_trial", false)
    .limit(1);
  if (courseError) {
    throw new Error(courseError.message || "Impossibile caricare i corsi.");
  }
  return (courses ?? []).length > 0;
}

async function findOpenQuotaFeeId(
  client: WalletClient,
  memberId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("lesson_fees")
    .select("id")
    .eq("member_id", memberId)
    .eq("kind", "quota")
    .in("status", OPEN_FEE_STATUSES)
    .order("due_on", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Impossibile cercare la retta quota.");
  }
  return data?.id ?? null;
}

async function memberQuotaPaid(
  client: WalletClient,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("member_quota_ok", {
    p_member_id: memberId,
  });
  if (error) {
    throw new Error(error.message || "Impossibile verificare la quota.");
  }
  return Boolean(data);
}

async function materializeVirtualQuota(
  client: WalletClient,
  memberId: string,
): Promise<CourseMutationResult> {
  const existing = await findOpenQuotaFeeId(client, memberId);
  if (existing) return ok(existing);

  const paid = await memberQuotaPaid(client, memberId);
  if (paid) return ok();

  const enrolled = await hasActiveNonTrialCourse(client, memberId);
  if (!enrolled) return ok();

  const amountEur = await resolveQuotaAmountEur(client, memberId);
  const { data, error } = await client
    .from("lesson_fees")
    .insert({
      course_enrollment_id: null,
      member_id: memberId,
      course_id: null,
      kind: "quota",
      status: "aperta",
      amount_eur: amountEur,
      remaining_eur: amountEur,
      due_on: todayInRome(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return fail(error?.message || "Impossibile aprire la riga quota.");
  }
  return ok(data.id);
}

function mapFeeRow(
  row: FeeRow,
  labels: {
    studentLabel: string;
    tutorLabel: string;
    courseName: string;
    teacherLabel: string;
  },
): LessonFeeRow {
  return {
    id: row.id,
    courseEnrollmentId: row.course_enrollment_id,
    memberId: row.member_id,
    courseId: row.course_id,
    kind: row.kind,
    status: row.status,
    amountEur: Number(row.amount_eur),
    remainingEur: Number(row.remaining_eur),
    dueOn: row.due_on,
    lastDunningAt: row.last_dunning_at,
    dunningCount: row.dunning_count,
    note: row.note,
    studentLabel: labels.studentLabel,
    tutorLabel: labels.tutorLabel,
    courseName: labels.courseName,
    teacherLabel: labels.teacherLabel,
  };
}

function matchesQuery(row: LessonFeeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.studentLabel,
    row.tutorLabel,
    row.courseName,
    row.teacherLabel,
  ].some((value) => value.toLowerCase().includes(q));
}

function dunningEmail(params: {
  kind: LessonFeeKind;
  recipientFirstName: string;
  studentLabel: string;
  courseName: string;
  remainingEur: number;
  dueOn: string;
}): { subject: string; body: string } {
  const due = formatDateIt(params.dueOn);
  const amount = formatEur(params.remainingEur);
  if (params.kind === "quota") {
    return {
      subject: "Sollecito quota associativa — MusicPro School",
      body: [
        `Ciao ${params.recipientFirstName},`,
        "",
        `ti ricordiamo che la quota associativa di ${params.studentLabel} risulta ancora da saldare.`,
        "",
        `Importo residuo: ${amount}`,
        `Scadenza: ${due}`,
        "",
        "Puoi saldare in segreteria (bonifico o altro).",
        "",
        "Grazie,",
        "MusicPro School",
      ].join("\n"),
    };
  }
  return {
    subject: "Sollecito retta pacchetto lezioni — MusicPro School",
    body: [
      `Ciao ${params.recipientFirstName},`,
      "",
      "ti ricordiamo che risulta aperta una retta per il pacchetto di 4 lezioni.",
      "",
      `Allievo: ${params.studentLabel}`,
      `Corso: ${params.courseName}`,
      `Importo residuo: ${amount}`,
      `Scadenza: ${due}`,
      "",
      "Puoi saldare in segreteria (bonifico o altro).",
      "",
      "Grazie,",
      "MusicPro School",
    ].join("\n"),
  };
}

async function markFeeDunned(
  client: WalletClient,
  feeId: string,
  currentCount: number,
): Promise<string | null> {
  const { error } = await client
    .from("lesson_fees")
    .update({
      last_dunning_at: new Date().toISOString(),
      dunning_count: currentCount + 1,
    })
    .eq("id", feeId);
  return error
    ? error.message || "Impossibile aggiornare il sollecito."
    : null;
}

async function sendFeeReminder(
  client: WalletClient,
  fee: Pick<
    LessonFeeRow,
    "kind" | "remainingEur" | "dueOn" | "studentLabel" | "courseName"
  >,
  member: MemberLabelRow,
): Promise<{ sent: boolean; warning?: string }> {
  const to = dunningRecipient(member);
  if (!to) {
    return {
      sent: false,
      warning: `Manca l'email per ${memberLabel(member.last_name, member.first_name)}.`,
    };
  }

  const recipientFirstName =
    (member.manual_tutor_email?.trim()
      ? member.manual_tutor_first_name?.trim()
      : null) || member.first_name;
  const email = dunningEmail({
    kind: fee.kind,
    recipientFirstName,
    studentLabel: fee.studentLabel,
    courseName: fee.courseName,
    remainingEur: fee.remainingEur,
    dueOn: fee.dueOn,
  });

  if (!process.env.RESEND_API_KEY?.trim()) {
    return {
      sent: false,
      warning: "RESEND_API_KEY assente: sollecito non inviato.",
    };
  }

  const sent = await sendLessonFamilyEmail(client, member.id, {
    subject: email.subject,
    body: email.body,
  });
  if (sent.sent > 0) return { sent: true };
  return {
    sent: false,
    warning: sent.warnings[0] || "Impossibile inviare il sollecito.",
  };
}

async function hydrateFeeRows(
  client: WalletClient,
  rows: FeeRow[],
): Promise<LessonFeeRow[]> {
  const memberIds = rows.map((row) => row.member_id);
  const courseIds = rows
    .map((row) => row.course_id)
    .filter((id): id is string => Boolean(id));

  const courseMap = new Map<string, CourseLabelRow>();
  if (courseIds.length > 0) {
    const { data, error } = await client
      .from("courses")
      .select("id, name, status, is_trial, price_eur, titular_member_id")
      .in("id", [...new Set(courseIds)]);
    if (error) {
      throw new Error(error.message || "Impossibile caricare i corsi delle rette.");
    }
    for (const row of data ?? []) {
      courseMap.set(row.id, row as CourseLabelRow);
    }
  }

  const teacherIds = [...courseMap.values()].map((row) => row.titular_member_id);
  const members = await loadMembersById(client, [...memberIds, ...teacherIds]);

  return rows.map((row) => {
    const student = members.get(row.member_id);
    const course = row.course_id ? courseMap.get(row.course_id) : undefined;
    const teacher = course ? members.get(course.titular_member_id) : undefined;
    return mapFeeRow(row, {
      studentLabel: student
        ? memberLabel(student.last_name, student.first_name)
        : "",
      tutorLabel: student ? tutorLabel(student) : "",
      courseName: row.kind === "quota" ? "Quota" : (course?.name ?? ""),
      teacherLabel: teacher
        ? memberLabel(teacher.last_name, teacher.first_name)
        : "",
    });
  });
}

async function listVirtualQuotaRows(
  client: WalletClient,
  opts: {
    include: boolean;
    courseId?: string;
    memberId?: string;
    query?: string;
  },
): Promise<LessonFeeRow[]> {
  if (!opts.include) return [];

  let courseQuery = client
    .from("courses")
    .select("id")
    .eq("status", "attivo")
    .eq("is_trial", false);
  if (opts.courseId) {
    courseQuery = courseQuery.eq("id", opts.courseId);
  }
  const { data: courses, error: courseError } = await courseQuery;
  if (courseError) {
    throw new Error(courseError.message || "Impossibile caricare i corsi attivi.");
  }
  const courseIds = (courses ?? []).map((row) => row.id);
  if (courseIds.length === 0) return [];

  let enrollQuery = client
    .from("course_enrollments")
    .select("member_id")
    .in("course_id", courseIds)
    .is("left_at", null);
  if (opts.memberId) {
    enrollQuery = enrollQuery.eq("member_id", opts.memberId);
  }
  const { data: enrollments, error: enrollError } = await enrollQuery;
  if (enrollError) {
    throw new Error(
      enrollError.message || "Impossibile caricare gli iscritti per la quota.",
    );
  }

  const memberIds = [...new Set((enrollments ?? []).map((row) => row.member_id))];
  if (memberIds.length === 0) return [];

  const year = currentFiscalYear();
  const [paidRes, openRes, members] = await Promise.all([
    client
      .from("member_annual_quotas")
      .select("member_id")
      .in("member_id", memberIds)
      .eq("fiscal_year", year)
      .not("paid_at", "is", null),
    client
      .from("lesson_fees")
      .select("member_id")
      .eq("kind", "quota")
      .in("status", OPEN_FEE_STATUSES)
      .in("member_id", memberIds),
    loadMembersById(client, memberIds),
  ]);
  if (paidRes.error) {
    throw new Error(paidRes.error.message || "Impossibile verificare le quote.");
  }
  if (openRes.error) {
    throw new Error(openRes.error.message || "Impossibile caricare le rette quota.");
  }

  const paid = new Set((paidRes.data ?? []).map((row) => row.member_id));
  const alreadyOpen = new Set((openRes.data ?? []).map((row) => row.member_id));
  const unpaid = memberIds.filter(
    (id) => !paid.has(id) && !alreadyOpen.has(id),
  );
  if (unpaid.length === 0) return [];

  const today = todayInRome();
  const rows: LessonFeeRow[] = [];
  for (const memberId of unpaid) {
    const member = members.get(memberId);
    if (!member) continue;
    const amountEur = await resolveQuotaAmountEur(client, memberId);
    const row: LessonFeeRow = {
      id: `quota:${memberId}`,
      courseEnrollmentId: null,
      memberId,
      courseId: null,
      kind: "quota",
      status: "aperta",
      amountEur,
      remainingEur: amountEur,
      dueOn: today,
      lastDunningAt: null,
      dunningCount: 0,
      note: null,
      studentLabel: memberLabel(member.last_name, member.first_name),
      tutorLabel: tutorLabel(member),
      courseName: "Quota",
      teacherLabel: "",
    };
    if (matchesQuery(row, opts.query ?? "")) {
      rows.push(row);
    }
  }
  return rows;
}

export async function getEnrollmentWallet(
  client: WalletClient,
  enrollmentId: string,
): Promise<EnrollmentWallet | null> {
  const enrollment = await loadEnrollment(client, enrollmentId);
  if (!enrollment) return null;

  const family = await lessonFamilyKey(client, enrollment.member_id);
  const leftoverEurFamily =
    "key" in family ? await leftoverForFamilyKey(client, family.key) : 0;

  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.course_id,
    memberId: enrollment.member_id,
    balance: await ledgerBalance(client, enrollment.id),
    openingPrepaidLessons: enrollment.opening_prepaid_lessons,
    leftoverEurFamily,
  };
}

/**
 * Wallet crediti lezione per enrollment attivi visibili al caller via RLS
 * (own + ward per tutore; docenti/staff via policy esistenti su enrollments).
 */
export async function listMyEnrollmentWallets(
  client: WalletClient,
): Promise<MemberEnrollmentWallet[]> {
  const { data: enrollments, error } = await client
    .from("course_enrollments")
    .select("id, course_id, member_id")
    .is("left_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare le iscrizioni del wallet.",
    );
  }
  const rows = enrollments ?? [];
  if (rows.length === 0) return [];

  const courseIds = [...new Set(rows.map((row) => row.course_id))];
  const enrollmentIds = rows.map((row) => row.id);

  const [coursesRes, ledgerRes] = await Promise.all([
    client.from("courses").select("id, name").in("id", courseIds),
    client
      .from("lesson_credit_ledger")
      .select("course_enrollment_id, delta")
      .in("course_enrollment_id", enrollmentIds),
  ]);
  if (coursesRes.error) {
    throw new Error(
      coursesRes.error.message || "Impossibile caricare i corsi del wallet.",
    );
  }
  if (ledgerRes.error) {
    throw new Error(
      ledgerRes.error.message || "Impossibile caricare i movimenti wallet.",
    );
  }

  const courseNameById = new Map(
    (coursesRes.data ?? []).map((row) => [row.id, row.name]),
  );
  const balanceByEnrollment = new Map<string, number>();
  for (const row of ledgerRes.data ?? []) {
    balanceByEnrollment.set(
      row.course_enrollment_id,
      (balanceByEnrollment.get(row.course_enrollment_id) ?? 0) + row.delta,
    );
  }

  return rows.map((row) => ({
    enrollmentId: row.id,
    courseId: row.course_id,
    courseName: courseNameById.get(row.course_id) ?? "",
    memberId: row.member_id,
    balance: balanceByEnrollment.get(row.id) ?? 0,
  }));
}

export async function listEnrollmentWalletsForCourse(
  client: WalletClient,
  courseId: string,
): Promise<EnrollmentWallet[]> {
  const { data: enrollments, error } = await client
    .from("course_enrollments")
    .select(
      "id, course_id, member_id, opening_prepaid_lessons, left_at, created_at, updated_at",
    )
    .eq("course_id", courseId)
    .is("left_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(
      error.message || "Impossibile caricare i wallet del corso.",
    );
  }
  const rows = enrollments ?? [];
  if (rows.length === 0) return [];

  const enrollmentIds = rows.map((row) => row.id);
  const memberIds = rows.map((row) => row.member_id);
  const [ledgerRes, members] = await Promise.all([
    client
      .from("lesson_credit_ledger")
      .select("course_enrollment_id, delta")
      .in("course_enrollment_id", enrollmentIds),
    loadMembersById(client, memberIds),
  ]);
  if (ledgerRes.error) {
    throw new Error(
      ledgerRes.error.message || "Impossibile caricare i movimenti wallet.",
    );
  }

  const balanceByEnrollment = new Map<string, number>();
  for (const row of ledgerRes.data ?? []) {
    balanceByEnrollment.set(
      row.course_enrollment_id,
      (balanceByEnrollment.get(row.course_enrollment_id) ?? 0) + row.delta,
    );
  }

  const leftoverByKey = new Map<string, number>();
  const familyKeys = [
    ...new Set(
      rows.map((row) => {
        const member = members.get(row.member_id);
        return familyKeyFromMember({
          id: row.member_id,
          manual_tutor_email: member?.manual_tutor_email ?? null,
        });
      }),
    ),
  ];
  if (familyKeys.length > 0) {
    const { data: accounts, error: accountError } = await client
      .from("lesson_family_accounts")
      .select("family_key, leftover_eur")
      .in("family_key", familyKeys);
    if (accountError) {
      throw new Error(
        accountError.message || "Impossibile caricare gli acconti famiglia.",
      );
    }
    for (const account of accounts ?? []) {
      leftoverByKey.set(account.family_key, Number(account.leftover_eur));
    }
  }

  return rows.map((row) => {
    const member = members.get(row.member_id);
    const familyKey = familyKeyFromMember({
      id: row.member_id,
      manual_tutor_email: member?.manual_tutor_email ?? null,
    });
    return {
      enrollmentId: row.id,
      courseId: row.course_id,
      memberId: row.member_id,
      balance: balanceByEnrollment.get(row.id) ?? 0,
      openingPrepaidLessons: row.opening_prepaid_lessons,
      leftoverEurFamily: leftoverByKey.get(familyKey) ?? 0,
    };
  });
}

export async function seedOpeningPrepaidCredits(
  client: WalletClient,
  input: {
    enrollmentId: string;
    lessons: number;
    note: string;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  if (!Number.isInteger(input.lessons) || input.lessons <= 0) {
    return ok(input.enrollmentId);
  }

  const enrollment = await loadEnrollment(client, input.enrollmentId);
  if (!enrollment) return fail("Iscrizione al corso non trovata.");

  const { data: existing, error: existingError } = await client
    .from("lesson_credit_ledger")
    .select("id")
    .eq("course_enrollment_id", input.enrollmentId)
    .eq("kind", "saldo_iniziale")
    .limit(1)
    .maybeSingle();
  if (existingError) {
    return fail(
      existingError.message || "Impossibile verificare il saldo iniziale.",
    );
  }
  if (existing) return ok(input.enrollmentId);

  const note = input.note.trim() || "Saldo iniziale";
  const { error } = await client.from("lesson_credit_ledger").insert({
    course_enrollment_id: enrollment.id,
    member_id: enrollment.member_id,
    course_id: enrollment.course_id,
    delta: input.lessons,
    kind: "saldo_iniziale",
    note,
    created_by: input.actorMemberId,
  });
  if (error) {
    return fail(error.message || "Impossibile registrare il saldo iniziale.");
  }
  return ok(input.enrollmentId);
}

export async function ensureOpenPackFee(
  client: WalletClient,
  enrollmentId: string,
): Promise<CourseMutationResult> {
  const enrollment = await loadEnrollment(client, enrollmentId);
  if (!enrollment) return fail("Iscrizione al corso non trovata.");

  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id, status, is_trial, price_eur")
    .eq("id", enrollment.course_id)
    .maybeSingle();
  if (courseError) {
    return fail(courseError.message || "Impossibile caricare il corso.");
  }
  if (!course) return fail("Corso non trovato.");
  if (course.status !== "attivo" || course.is_trial) {
    return ok(enrollmentId);
  }

  const priceEur = Number(course.price_eur);
  if (!Number.isFinite(priceEur) || priceEur <= 0) {
    return ok(enrollmentId);
  }

  const balance = await ledgerBalance(client, enrollmentId);
  if (balance > 0) {
    return ok(enrollmentId);
  }

  const debt = Math.max(0, -balance);
  let needed = debt === 0 ? 0 : Math.ceil(debt / 4);
  let openCount = await openPackFeeCount(client, enrollmentId);
  if (balance >= 0 && openCount === 0) {
    needed = 1;
  }

  let lastId: string | undefined;
  while (openCount < needed) {
    const inserted = await insertPackFee(client, {
      enrollmentId: enrollment.id,
      memberId: enrollment.member_id,
      courseId: enrollment.course_id,
      amountEur: priceEur,
    });
    if (typeof inserted !== "string") return fail(inserted.errorMessage);
    lastId = inserted;
    openCount += 1;
  }

  return ok(lastId ?? enrollmentId);
}

export async function listLessonFees(
  client: WalletClient,
  opts?: {
    mode?: "default" | "all";
    status?: LessonFeeStatus[];
    query?: string;
    courseId?: string;
    memberId?: string;
  },
): Promise<LessonFeeRow[]> {
  const mode = opts?.mode ?? "default";
  const today = todayInRome();
  const dueLimit = addDays(today, 5);

  let query = client.from("lesson_fees").select(
    "id, course_enrollment_id, member_id, course_id, kind, status, amount_eur, remaining_eur, due_on, last_dunning_at, dunning_count, note, created_at, updated_at",
  );

  if (opts?.status && opts.status.length > 0) {
    query = query.in("status", opts.status);
  } else if (mode === "default") {
    query = query.in("status", OPEN_FEE_STATUSES);
  }
  if (mode === "default") {
    query = query.lte("due_on", dueLimit);
  }
  if (opts?.courseId) {
    query = query.eq("course_id", opts.courseId);
  }
  if (opts?.memberId) {
    query = query.eq("member_id", opts.memberId);
  }

  const { data, error } = await query
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message || "Impossibile caricare le rette.");
  }

  const feeRows = [...(data ?? [])];
  if (opts?.courseId) {
    const { data: enrolled, error: enrolledError } = await client
      .from("course_enrollments")
      .select("member_id")
      .eq("course_id", opts.courseId)
      .is("left_at", null);
    if (enrolledError) {
      throw new Error(
        enrolledError.message || "Impossibile caricare gli iscritti del corso.",
      );
    }
    const memberIds = [
      ...new Set((enrolled ?? []).map((row) => row.member_id)),
    ];
    if (memberIds.length > 0) {
      let quotaQuery = client
        .from("lesson_fees")
        .select(
          "id, course_enrollment_id, member_id, course_id, kind, status, amount_eur, remaining_eur, due_on, last_dunning_at, dunning_count, note, created_at, updated_at",
        )
        .eq("kind", "quota")
        .in("member_id", memberIds);
      if (opts.status && opts.status.length > 0) {
        quotaQuery = quotaQuery.in("status", opts.status);
      } else if (mode === "default") {
        quotaQuery = quotaQuery.in("status", OPEN_FEE_STATUSES);
      }
      if (mode === "default") {
        quotaQuery = quotaQuery.lte("due_on", dueLimit);
      }
      if (opts.memberId) {
        quotaQuery = quotaQuery.eq("member_id", opts.memberId);
      }
      const { data: quotaRows, error: quotaError } = await quotaQuery;
      if (quotaError) {
        throw new Error(
          quotaError.message || "Impossibile caricare le rette quota.",
        );
      }
      const seen = new Set(feeRows.map((row) => row.id));
      for (const row of quotaRows ?? []) {
        if (!seen.has(row.id)) feeRows.push(row);
      }
    }
  }

  const rows = await hydrateFeeRows(client, feeRows);
  const filtered = opts?.query
    ? rows.filter((row) => matchesQuery(row, opts.query ?? ""))
    : rows;

  const includeVirtual = !opts?.status || opts.status.includes("aperta");
  const virtual = await listVirtualQuotaRows(client, {
    include: includeVirtual,
    courseId: opts?.courseId,
    memberId: opts?.memberId,
    query: opts?.query,
  });

  const seenMembers = new Set(
    filtered
      .filter((row) => row.kind === "quota")
      .map((row) => row.memberId),
  );
  const extra = virtual.filter((row) => !seenMembers.has(row.memberId));
  const merged = [...filtered, ...extra];
  merged.sort((a, b) => {
    const byDue = a.dueOn.localeCompare(b.dueOn);
    if (byDue !== 0) return byDue;
    return a.studentLabel.localeCompare(b.studentLabel, "it");
  });
  return merged;
}

export async function registerFamilyCollection(
  client: WalletClient,
  input: {
    memberId: string;
    amountEur: number;
    method: "bonifico" | "altro";
    paidOn: string;
    note?: string;
    cro?: string;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Manca l'operatore dell'incasso.");
  }
  const roles = await getMemberRoles(client, input.actorMemberId);
  if (!roles.includes("admin") && !roles.includes("segreteria")) {
    return fail("Solo lo staff può registrare un incasso famiglia.");
  }
  if (!Number.isFinite(input.amountEur) || input.amountEur <= 0) {
    return fail("L'importo da incassare non è valido.");
  }
  if (!ISO_DATE_RE.test(input.paidOn)) {
    return fail("La data di pagamento non è valida.");
  }
  if (input.method !== "bonifico" && input.method !== "altro") {
    return fail("Metodo di pagamento non valido.");
  }

  const family = await lessonFamilyKey(client, input.memberId);
  if ("errorMessage" in family) return fail(family.errorMessage);

  const { data: member, error: memberError } = await client
    .from("members")
    .select("id, manual_tutor_email")
    .eq("id", input.memberId)
    .maybeSingle();
  if (memberError) {
    return fail(memberError.message || "Impossibile caricare l'associato.");
  }
  if (!member) return fail("Associato non trovato.");

  const familyMemberIds = new Set<string>([input.memberId]);
  const tutorEmail = member.manual_tutor_email?.trim() ?? "";
  if (tutorEmail) {
    const { data: siblings, error: siblingError } = await client
      .from("members")
      .select("id")
      .ilike("manual_tutor_email", tutorEmail);
    if (siblingError) {
      return fail(
        siblingError.message || "Impossibile caricare i familiari.",
      );
    }
    for (const row of siblings ?? []) {
      familyMemberIds.add(row.id);
    }
  }

  let includeQuota = false;
  for (const memberId of familyMemberIds) {
    const materialized = await materializeVirtualQuota(client, memberId);
    if (!materialized.success) return materialized;
    if (materialized.id) includeQuota = true;
  }

  const { data: payment, error: paymentError } = await client
    .from("lesson_pack_payments")
    .insert({
      family_key: family.key,
      member_id: input.memberId,
      amount_eur: input.amountEur,
      method: input.method,
      status: "pending",
      paid_on: input.paidOn,
      note: input.note?.trim() || null,
      cro: input.cro?.trim() || null,
      include_quota: includeQuota,
      created_by: input.actorMemberId,
    })
    .select("id")
    .single();
  if (paymentError || !payment) {
    return fail(paymentError?.message || "Impossibile registrare l'incasso.");
  }

  const { data: applied, error: applyError } = await client.rpc(
    "apply_lesson_pack_payment",
    { p_payment_id: payment.id },
  );
  if (applyError) {
    return fail(
      applyError.message || "Incasso registrato, ma non è stato spalmato sulle rette.",
      { id: payment.id },
    );
  }
  const applyMessage = rpcFailedMessage(
    applied,
    "Incasso registrato, ma non è stato spalmato sulle rette.",
  );
  if (applyMessage) return fail(applyMessage, { id: payment.id });

  const receipt = await emitFiscalReceiptForPayment(client, {
    paymentId: payment.id,
    actorMemberId: input.actorMemberId,
  });
  const warnings = receipt.success
    ? receipt.warnings
    : [
        receipt.errorMessage ||
          "Incasso registrato, ma la ricevuta non è stata emessa.",
      ];

  return ok(payment.id, warnings);
}

export async function sendFeeDunning(
  client: WalletClient,
  feeIds: string[],
  actorMemberId: string,
): Promise<CourseMutationResult> {
  if (!actorMemberId.trim()) {
    return fail("Manca l'operatore del sollecito.");
  }
  const dunningRoles = await getMemberRoles(client, actorMemberId);
  if (!dunningRoles.includes("admin") && !dunningRoles.includes("segreteria")) {
    return fail("Solo lo staff può inviare i solleciti.");
  }
  const uniqueIds = [...new Set(feeIds.filter((id) => id.trim()))];
  if (uniqueIds.length === 0) {
    return fail("Nessuna retta selezionata.");
  }

  const resolvedIds: string[] = [];
  for (const feeId of uniqueIds) {
    if (feeId.startsWith("quota:")) {
      const memberId = feeId.slice("quota:".length);
      const materialized = await materializeVirtualQuota(client, memberId);
      if (!materialized.success) return materialized;
      if (!materialized.id) {
        return fail("La riga quota non è più da sollecitare.");
      }
      resolvedIds.push(materialized.id);
      continue;
    }
    resolvedIds.push(feeId);
  }

  const { data: feeRows, error } = await client
    .from("lesson_fees")
    .select(
      "id, course_enrollment_id, member_id, course_id, kind, status, amount_eur, remaining_eur, due_on, last_dunning_at, dunning_count, note, created_at, updated_at",
    )
    .in("id", resolvedIds);
  if (error) {
    return fail(error.message || "Impossibile caricare le rette da sollecitare.");
  }

  const found = new Set((feeRows ?? []).map((row) => row.id));
  const missing = resolvedIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return fail("Una o più rette non sono state trovate.");
  }

  const hydrated = await hydrateFeeRows(client, feeRows ?? []);
  const members = await loadMembersById(
    client,
    hydrated.map((row) => row.memberId),
  );
  const warnings: string[] = [];
  let sentCount = 0;

  for (const fee of hydrated) {
    const member = members.get(fee.memberId);
    if (!member) {
      warnings.push("Associato non trovato per una retta.");
      continue;
    }
    const result = await sendFeeReminder(client, fee, member);
    if (result.warning) warnings.push(result.warning);
    if (!result.sent) continue;
    const updateError = await markFeeDunned(
      client,
      fee.id,
      fee.dunningCount,
    );
    if (updateError) warnings.push(updateError);
    sentCount += 1;
  }

  if (sentCount === 0 && warnings.length > 0 && !process.env.RESEND_API_KEY?.trim()) {
    return ok(undefined, warnings);
  }
  return ok(undefined, warnings);
}

export async function maybeSendPackReminders(
  client: WalletClient,
  courseId: string,
): Promise<void> {
  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id, name, status, is_trial, titular_member_id")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError || !course || course.is_trial || course.status !== "attivo") {
    return;
  }

  const settings = await getLessonSchoolSettings(client);
  const hours1 = settings?.packRemindHours1 ?? DEFAULT_PACK_REMIND_HOURS_1;
  const hours2 = settings?.packRemindHours2 ?? DEFAULT_PACK_REMIND_HOURS_2;
  const nearHours = Math.min(hours1, hours2);
  const farHours = Math.max(hours1, hours2);

  const { data: enrollments, error: enrollError } = await client
    .from("course_enrollments")
    .select("id, member_id")
    .eq("course_id", courseId)
    .is("left_at", null);
  if (enrollError || !enrollments || enrollments.length === 0) return;

  const nowIso = new Date().toISOString();
  const { data: lessonRows, error: lessonError } = await client
    .from("lessons")
    .select("id, starts_at")
    .eq("course_id", courseId)
    .eq("placement", "scheduled")
    .is("cancelled_at", null)
    .gt("starts_at", nowIso)
    .order("starts_at", { ascending: true });
  if (lessonError) return;

  const futureStarts = (lessonRows ?? [])
    .map((row) => row.starts_at)
    .filter((value): value is string => Boolean(value));
  if (futureStarts.length === 0) return;

  const enrollmentIds = enrollments.map((row) => row.id);
  const { data: openFees, error: feeError } = await client
    .from("lesson_fees")
    .select(
      "id, course_enrollment_id, member_id, course_id, kind, status, amount_eur, remaining_eur, due_on, last_dunning_at, dunning_count, note, created_at, updated_at",
    )
    .in("course_enrollment_id", enrollmentIds)
    .eq("kind", "pack")
    .in("status", OPEN_FEE_STATUSES)
    .order("due_on", { ascending: true });
  if (feeError || !openFees || openFees.length === 0) return;

  const feeByEnrollment = new Map<string, FeeRow>();
  for (const fee of openFees) {
    if (!fee.course_enrollment_id) continue;
    if (!feeByEnrollment.has(fee.course_enrollment_id)) {
      feeByEnrollment.set(fee.course_enrollment_id, fee);
    }
  }

  const members = await loadMembersById(
    client,
    enrollments.map((row) => row.member_id),
  );
  const nowMs = Date.now();

  for (const enrollment of enrollments) {
    const fee = feeByEnrollment.get(enrollment.id);
    if (!fee) continue;

    const balance = await ledgerBalance(client, enrollment.id);
    const covered = Math.max(0, balance);
    const targetStart = futureStarts[covered];
    if (!targetStart) continue;

    const hoursUntil = (Date.parse(targetStart) - nowMs) / 3_600_000;
    if (!Number.isFinite(hoursUntil) || hoursUntil <= 0) continue;

    const hitNear = hoursUntil <= nearHours;
    const hitFar = hoursUntil <= farHours;
    if (!hitFar) continue;

    const threshold = hitNear ? 2 : 1;
    if (fee.dunning_count >= threshold) continue;

    const member = members.get(enrollment.member_id);
    if (!member) continue;

    const result = await sendFeeReminder(
      client,
      {
        kind: "pack",
        remainingEur: Number(fee.remaining_eur),
        dueOn: fee.due_on,
        studentLabel: memberLabel(member.last_name, member.first_name),
        courseName: course.name,
      },
      member,
    );
    if (!result.sent) continue;
    await markFeeDunned(client, fee.id, Math.max(fee.dunning_count, threshold - 1));
  }
}

export async function waiveLessonFee(
  client: WalletClient,
  feeId: string,
  note: string,
  actorMemberId: string,
): Promise<CourseMutationResult> {
  const trimmed = note.trim();
  if (!trimmed) return fail("La nota di abbuono è obbligatoria.");
  if (!actorMemberId.trim()) return fail("Manca l'operatore dell'abbuono.");
  const waiveRoles = await getMemberRoles(client, actorMemberId);
  if (!waiveRoles.includes("admin") && !waiveRoles.includes("segreteria")) {
    return fail("Solo lo staff può abbuonare una retta.");
  }
  if (feeId.startsWith("quota:")) {
    const materialized = await materializeVirtualQuota(
      client,
      feeId.slice("quota:".length),
    );
    if (!materialized.success) return materialized;
    if (!materialized.id) return fail("La riga quota non è più abbuonabile.");
    return waiveLessonFee(client, materialized.id, trimmed, actorMemberId);
  }

  const { data: fee, error: loadError } = await client
    .from("lesson_fees")
    .select("id, status")
    .eq("id", feeId)
    .maybeSingle();
  if (loadError) {
    return fail(loadError.message || "Impossibile caricare la retta.");
  }
  if (!fee) return fail("Retta non trovata.");
  if (fee.status === "saldata" || fee.status === "abbuonata") {
    return fail("Si può abbuonare solo una retta aperta o parziale.");
  }

  const { error } = await client
    .from("lesson_fees")
    .update({
      status: "abbuonata",
      remaining_eur: 0,
      note: trimmed,
    })
    .eq("id", feeId);
  if (error) {
    return fail(error.message || "Impossibile abbuonare la retta.");
  }
  return ok(feeId);
}

export async function adjustEnrollmentCredits(
  client: WalletClient,
  input: {
    enrollmentId: string;
    delta: number;
    note: string;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  const note = input.note.trim();
  if (!note) return fail("La nota di rettifica è obbligatoria.");
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return fail("La rettifica deve essere un numero intero diverso da zero.");
  }

  const enrollment = await loadEnrollment(client, input.enrollmentId);
  if (!enrollment) return fail("Iscrizione al corso non trovata.");

  const { error } = await client.from("lesson_credit_ledger").insert({
    course_enrollment_id: enrollment.id,
    member_id: enrollment.member_id,
    course_id: enrollment.course_id,
    delta: input.delta,
    kind: "rettifica",
    note,
    created_by: input.actorMemberId,
  });
  if (error) {
    return fail(error.message || "Impossibile registrare la rettifica crediti.");
  }
  return ok(input.enrollmentId);
}
