import type { SupabaseClient } from "@supabase/supabase-js";

import { getMemberRoles } from "./auth";
import type { CourseMutationResult } from "./courses";
import { emitFiscalReceiptForPayment } from "./lessons-receipts";
import type { Database, Json } from "./types/database";

type CashClient = SupabaseClient<Database>;

export type TeacherCashAdvanceRow = {
  id: string;
  teacherMemberId: string;
  teacherLabel: string;
  paymentId: string | null;
  enrollmentId: string | null;
  studentLabel: string;
  courseName: string;
  amountEur: number;
  status: "pending" | "confirmed" | "rejected";
  note: string | null;
  createdAt: string;
};

type CashAdvanceStatus = TeacherCashAdvanceRow["status"];

type AdvanceRow = Database["public"]["Tables"]["teacher_cash_advances"]["Row"];

type MemberLabelRow = {
  id: string;
  first_name: string;
  last_name: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function rpcFailedMessage(data: Json, fallback: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.success !== false) return null;
  const message = data.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function isStaffMember(
  client: CashClient,
  memberId: string,
): Promise<boolean> {
  const roles = await getMemberRoles(client, memberId);
  return roles.includes("admin") || roles.includes("segreteria");
}

async function lessonFamilyKey(
  client: CashClient,
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

async function loadMembersById(
  client: CashClient,
  ids: string[],
): Promise<Map<string, MemberLabelRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, MemberLabelRow>();
  if (unique.length === 0) return map;
  const { data, error } = await client
    .from("members")
    .select("id, first_name, last_name")
    .in("id", unique);
  if (error) {
    throw new Error(error.message || "Impossibile caricare gli associati.");
  }
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return map;
}

export async function registerTeacherCashCollection(
  client: CashClient,
  input: {
    enrollmentId: string;
    amountEur: number;
    paidOn: string;
    note?: string;
    actorMemberId: string;
  },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Manca l'operatore dell'incasso.");
  }
  if (!input.enrollmentId.trim()) {
    return fail("Manca l'iscrizione al corso.");
  }
  if (!Number.isFinite(input.amountEur) || input.amountEur <= 0) {
    return fail("L'importo da incassare non è valido.");
  }
  if (!ISO_DATE_RE.test(input.paidOn)) {
    return fail("La data di pagamento non è valida.");
  }

  const { data: enrollment, error: enrollError } = await client
    .from("course_enrollments")
    .select("id, course_id, member_id, left_at")
    .eq("id", input.enrollmentId)
    .maybeSingle();
  if (enrollError) {
    return fail(enrollError.message || "Impossibile caricare l'iscrizione al corso.");
  }
  if (!enrollment) return fail("Iscrizione al corso non trovata.");
  if (enrollment.left_at) {
    return fail("L'iscrizione non è più attiva.");
  }

  const { data: course, error: courseError } = await client
    .from("courses")
    .select("id, name, titular_member_id")
    .eq("id", enrollment.course_id)
    .maybeSingle();
  if (courseError) {
    return fail(courseError.message || "Impossibile caricare il corso.");
  }
  if (!course) return fail("Corso non trovato.");

  const isTitular = course.titular_member_id === input.actorMemberId;
  const isStaff = await isStaffMember(client, input.actorMemberId);
  if (!isTitular && !isStaff) {
    return fail(
      "Solo il titolare del corso o lo staff può registrare i contanti.",
    );
  }

  const family = await lessonFamilyKey(client, enrollment.member_id);
  if ("errorMessage" in family) return fail(family.errorMessage);

  const { data: payment, error: paymentError } = await client
    .from("lesson_pack_payments")
    .insert({
      family_key: family.key,
      member_id: enrollment.member_id,
      amount_eur: input.amountEur,
      method: "contanti",
      status: "completed",
      paid_on: input.paidOn,
      note: input.note?.trim() || null,
      created_by: input.actorMemberId,
    })
    .select("id")
    .single();
  if (paymentError || !payment) {
    return fail(paymentError?.message || "Impossibile registrare i contanti.");
  }

  const { data: applied, error: applyError } = await client.rpc(
    "apply_lesson_pack_payment",
    { p_payment_id: payment.id },
  );
  if (applyError) {
    return fail(
      applyError.message ||
        "Incasso registrato, ma non è stato spalmato sulle rette.",
      { id: payment.id },
    );
  }
  const applyMessage = rpcFailedMessage(
    applied,
    "Incasso registrato, ma non è stato spalmato sulle rette.",
  );
  if (applyMessage) return fail(applyMessage, { id: payment.id });

  const { error: advanceError } = await client
    .from("teacher_cash_advances")
    .insert({
      teacher_member_id: course.titular_member_id,
      payment_id: payment.id,
      enrollment_id: enrollment.id,
      amount_eur: input.amountEur,
      status: "pending",
      note: input.note?.trim() || null,
    });
  if (advanceError) {
    return fail(
      advanceError.message ||
        "Crediti aggiornati, ma l'anticipo docente non è stato messo in coda.",
      { id: payment.id },
    );
  }

  const receipt = await emitFiscalReceiptForPayment(client, {
    paymentId: payment.id,
    actorMemberId: input.actorMemberId,
  });
  const warnings = receipt.success
    ? receipt.warnings
    : [
        receipt.errorMessage ||
          "Contanti registrati, ma la ricevuta non è stata emessa.",
      ];

  return ok(payment.id, warnings);
}

export async function listTeacherCashAdvances(
  client: CashClient,
  options?: { status?: CashAdvanceStatus },
): Promise<TeacherCashAdvanceRow[]> {
  const status = options?.status ?? "pending";
  const { data, error } = await client
    .from("teacher_cash_advances")
    .select(
      "id, teacher_member_id, payment_id, enrollment_id, amount_eur, status, note, created_at",
    )
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(error.message || "Impossibile caricare gli anticipi docente.");
  }

  const rows = (data ?? []) as AdvanceRow[];
  if (rows.length === 0) return [];

  const enrollmentIds = [
    ...new Set(
      rows
        .map((row) => row.enrollment_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const enrollmentMap = new Map<
    string,
    { member_id: string; course_id: string }
  >();
  if (enrollmentIds.length > 0) {
    const { data: enrollments, error: enrollError } = await client
      .from("course_enrollments")
      .select("id, member_id, course_id")
      .in("id", enrollmentIds);
    if (enrollError) {
      throw new Error(
        enrollError.message || "Impossibile caricare le iscrizioni degli anticipi.",
      );
    }
    for (const row of enrollments ?? []) {
      enrollmentMap.set(row.id, {
        member_id: row.member_id,
        course_id: row.course_id,
      });
    }
  }

  const courseIds = [
    ...new Set(
      [...enrollmentMap.values()].map((row) => row.course_id).filter(Boolean),
    ),
  ];
  const courseMap = new Map<string, string>();
  if (courseIds.length > 0) {
    const { data: courses, error: courseError } = await client
      .from("courses")
      .select("id, name")
      .in("id", courseIds);
    if (courseError) {
      throw new Error(
        courseError.message || "Impossibile caricare i corsi degli anticipi.",
      );
    }
    for (const row of courses ?? []) {
      courseMap.set(row.id, row.name);
    }
  }

  const memberIds = [
    ...rows.map((row) => row.teacher_member_id),
    ...[...enrollmentMap.values()].map((row) => row.member_id),
  ];
  const members = await loadMembersById(client, memberIds);

  return rows.map((row) => {
    const enrollment = row.enrollment_id
      ? enrollmentMap.get(row.enrollment_id)
      : undefined;
    const teacher = members.get(row.teacher_member_id);
    const student = enrollment ? members.get(enrollment.member_id) : undefined;
    return {
      id: row.id,
      teacherMemberId: row.teacher_member_id,
      teacherLabel: teacher
        ? memberLabel(teacher.last_name, teacher.first_name)
        : "",
      paymentId: row.payment_id,
      enrollmentId: row.enrollment_id,
      studentLabel: student
        ? memberLabel(student.last_name, student.first_name)
        : "",
      courseName: enrollment ? (courseMap.get(enrollment.course_id) ?? "") : "",
      amountEur: Number(row.amount_eur),
      status: row.status,
      note: row.note,
      createdAt: row.created_at,
    };
  });
}

export async function confirmTeacherCashAdvance(
  client: CashClient,
  input: { advanceId: string; actorMemberId: string },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Manca l'operatore della conferma.");
  }
  if (!input.advanceId.trim()) {
    return fail("Manca l'anticipo da confermare.");
  }

  const isStaff = await isStaffMember(client, input.actorMemberId);
  if (!isStaff) {
    return fail("Solo lo staff può confermare l'anticipo docente.");
  }

  const { data: advance, error: loadError } = await client
    .from("teacher_cash_advances")
    .select("id, status")
    .eq("id", input.advanceId)
    .maybeSingle();
  if (loadError) {
    return fail(loadError.message || "Impossibile caricare l'anticipo.");
  }
  if (!advance) return fail("Anticipo non trovato.");
  if (advance.status !== "pending") {
    return fail("Si può confermare solo un anticipo ancora in attesa.");
  }

  const { error } = await client
    .from("teacher_cash_advances")
    .update({
      status: "confirmed",
      confirmed_by: input.actorMemberId,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", input.advanceId)
    .eq("status", "pending");
  if (error) {
    return fail(error.message || "Impossibile confermare l'anticipo.");
  }
  return ok(input.advanceId);
}

export async function rejectTeacherCashAdvance(
  client: CashClient,
  input: { advanceId: string; actorMemberId: string; note?: string },
): Promise<CourseMutationResult> {
  if (!input.actorMemberId.trim()) {
    return fail("Manca l'operatore dello scarto.");
  }
  if (!input.advanceId.trim()) {
    return fail("Manca l'anticipo da scartare.");
  }

  const isStaff = await isStaffMember(client, input.actorMemberId);
  if (!isStaff) {
    return fail("Solo lo staff può scartare l'anticipo docente.");
  }

  const { data: advance, error: loadError } = await client
    .from("teacher_cash_advances")
    .select("id, status, note")
    .eq("id", input.advanceId)
    .maybeSingle();
  if (loadError) {
    return fail(loadError.message || "Impossibile caricare l'anticipo.");
  }
  if (!advance) return fail("Anticipo non trovato.");
  if (advance.status !== "pending") {
    return fail("Si può scartare solo un anticipo ancora in attesa.");
  }

  const extraNote = input.note?.trim() ?? "";
  const existingNote = advance.note?.trim() ?? "";
  const nextNote = extraNote
    ? [existingNote, extraNote].filter(Boolean).join("\n")
    : advance.note;

  const { error } = await client
    .from("teacher_cash_advances")
    .update({
      status: "rejected",
      note: nextNote,
    })
    .eq("id", input.advanceId)
    .eq("status", "pending");
  if (error) {
    return fail(error.message || "Impossibile scartare l'anticipo.");
  }
  return ok(input.advanceId);
}
