import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseMutationResult } from "./courses";
import type { Database, Json } from "./types/database";

type IntentsClient = SupabaseClient<Database>;

type IntentRow = Pick<
  Database["public"]["Tables"]["enrollment_lesson_intents"]["Row"],
  | "id"
  | "membership_enrollment_id"
  | "member_id"
  | "requested_course_id"
  | "preferred_teacher_member_id"
  | "pay_first_pack_with_quota"
  | "lesson_pack_payment_id"
  | "status"
  | "converted_course_id"
  | "converted_course_enrollment_id"
  | "created_at"
>;

export type EnrollmentLessonIntentStatus = IntentRow["status"];

export type EnrollmentLessonIntentPaymentState =
  | "none"
  | "paid_unreconciled"
  | "converted";

export type EnrollmentLessonIntent = {
  id: string;
  memberId: string | null;
  memberLabel: string;
  requestedCourseId: string;
  requestedCourseName: string;
  preferredTeacherMemberId: string | null;
  preferredTeacherLabel: string | null;
  paymentState: EnrollmentLessonIntentPaymentState;
  membershipEnrollmentLabel: string;
  status: EnrollmentLessonIntentStatus;
  convertedCourseId: string | null;
  convertedCourseName: string | null;
  convertedTitularMemberId: string | null;
  payFirstPackWithQuota: boolean;
  membershipEnrollmentId: string;
  createdAt: string;
};

export type ReconcileEnrollmentLessonIntentResult = CourseMutationResult;

const INTENT_COLUMNS =
  "id, membership_enrollment_id, member_id, requested_course_id, preferred_teacher_member_id, pay_first_pack_with_quota, lesson_pack_payment_id, status, converted_course_id, converted_course_enrollment_id, created_at";

function fail(errorMessage: string): CourseMutationResult {
  return { success: false, errorMessage };
}

function ok(id?: string): CourseMutationResult {
  return id ? { success: true, id } : { success: true };
}

function rpcFailedMessage(data: Json, fallback: string): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.success !== false) return null;
  const message = data.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function memberLabel(
  row:
    | Pick<
        Database["public"]["Tables"]["members"]["Row"],
        "first_name" | "last_name"
      >
    | null
    | undefined,
  fallback = "—",
): string {
  if (!row) return fallback;
  const label = [row.last_name, row.first_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  return label || fallback;
}

export function paymentStateForEnrollmentLessonIntent(
  row: Pick<
    IntentRow,
    "status" | "lesson_pack_payment_id" | "converted_course_id"
  >,
): EnrollmentLessonIntentPaymentState {
  if (row.status === "converted" || row.converted_course_id) {
    return "converted";
  }
  if (
    row.status === "paid_unreconciled" ||
    Boolean(row.lesson_pack_payment_id)
  ) {
    return "paid_unreconciled";
  }
  return "none";
}

function membershipEnrollmentLabel(input: {
  paymentStatus: string | null | undefined;
  isDraft: boolean;
  formPayload: unknown;
}): string {
  if (input.isDraft) return "Modulo incompleto";
  const paid =
    String(input.paymentStatus || "")
      .trim()
      .toUpperCase() === "PAGATO";
  if (!paid) return "Quota associativa da pagare";
  if (!input.formPayload) return "Modulo da verificare";
  return "Iscrizione associativa ok";
}

async function enrichIntentRows(
  client: IntentsClient,
  rows: IntentRow[],
): Promise<EnrollmentLessonIntent[]> {
  if (rows.length === 0) return [];

  const memberIds = new Set<string>();
  const courseIds = new Set<string>();
  const membershipIds = new Set<string>();

  for (const row of rows) {
    if (row.member_id) memberIds.add(row.member_id);
    if (row.preferred_teacher_member_id) {
      memberIds.add(row.preferred_teacher_member_id);
    }
    courseIds.add(row.requested_course_id);
    if (row.converted_course_id) courseIds.add(row.converted_course_id);
    membershipIds.add(row.membership_enrollment_id);
  }

  const [membersRes, coursesRes, membershipsRes] = await Promise.all([
    memberIds.size
      ? client
          .from("members")
          .select("id, first_name, last_name, is_enrollment_draft")
          .in("id", [...memberIds])
      : Promise.resolve({ data: [], error: null }),
    courseIds.size
      ? client
          .from("courses")
          .select("id, name, titular_member_id")
          .in("id", [...courseIds])
      : Promise.resolve({ data: [], error: null }),
    membershipIds.size
      ? client
          .from("enrollments")
          .select("id, member_id, payment_status, form_payload")
          .in("id", [...membershipIds])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (membersRes.error) {
    throw new Error(
      membersRes.error.message || "Impossibile caricare gli allievi.",
    );
  }
  if (coursesRes.error) {
    throw new Error(
      coursesRes.error.message || "Impossibile caricare i corsi richiesti.",
    );
  }
  if (membershipsRes.error) {
    throw new Error(
      membershipsRes.error.message ||
        "Impossibile caricare le iscrizioni associative.",
    );
  }

  const memberById = new Map((membersRes.data ?? []).map((m) => [m.id, m]));
  const courseById = new Map((coursesRes.data ?? []).map((c) => [c.id, c]));
  const membershipById = new Map(
    (membershipsRes.data ?? []).map((e) => [e.id, e]),
  );

  for (const membership of membershipsRes.data ?? []) {
    if (membership.member_id) memberIds.add(membership.member_id);
  }

  const missingMemberIds = [...memberIds].filter((id) => !memberById.has(id));
  if (missingMemberIds.length > 0) {
    const { data, error } = await client
      .from("members")
      .select("id, first_name, last_name, is_enrollment_draft")
      .in("id", missingMemberIds);
    if (error) {
      throw new Error(error.message || "Impossibile caricare gli allievi.");
    }
    for (const row of data ?? []) {
      memberById.set(row.id, row);
    }
  }

  return rows.map((row) => {
    const membership = membershipById.get(row.membership_enrollment_id);
    const memberId = row.member_id ?? membership?.member_id ?? null;
    const member = memberId ? memberById.get(memberId) : null;
    const requested = courseById.get(row.requested_course_id);
    const converted = row.converted_course_id
      ? courseById.get(row.converted_course_id)
      : null;
    const teacher = row.preferred_teacher_member_id
      ? memberById.get(row.preferred_teacher_member_id)
      : null;

    return {
      id: row.id,
      membershipEnrollmentId: row.membership_enrollment_id,
      memberId,
      memberLabel: memberLabel(member, membership?.member_id ? "Allievo" : "—"),
      requestedCourseId: row.requested_course_id,
      requestedCourseName: requested?.name ?? "Corso richiesto",
      preferredTeacherMemberId: row.preferred_teacher_member_id,
      preferredTeacherLabel: teacher ? memberLabel(teacher) : null,
      paymentState: paymentStateForEnrollmentLessonIntent(row),
      membershipEnrollmentLabel: membershipEnrollmentLabel({
        paymentStatus: membership?.payment_status,
        isDraft: Boolean(member?.is_enrollment_draft),
        formPayload: membership?.form_payload,
      }),
      status: row.status,
      convertedCourseId: row.converted_course_id,
      convertedCourseName: converted?.name ?? null,
      convertedTitularMemberId: converted?.titular_member_id ?? null,
      payFirstPackWithQuota: row.pay_first_pack_with_quota,
      createdAt: row.created_at,
    };
  });
}

async function listEnrollmentLessonIntents(
  client: IntentsClient,
): Promise<EnrollmentLessonIntent[]> {
  const { data, error } = await client
    .from("enrollment_lesson_intents")
    .select(INTENT_COLUMNS)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(
      error.message || "Impossibile caricare le richieste di iscrizione.",
    );
  }

  return enrichIntentRows(client, data ?? []);
}

export async function listIntentsForStaff(
  client: IntentsClient,
): Promise<EnrollmentLessonIntent[]> {
  return listEnrollmentLessonIntents(client);
}

/** RLS docente: docente preferito o titolare del corso convertito. */
export async function listIntentsForTeacher(
  client: IntentsClient,
): Promise<EnrollmentLessonIntent[]> {
  return listEnrollmentLessonIntents(client);
}

export async function getIntentByMembershipEnrollment(
  client: IntentsClient,
  membershipEnrollmentId: string,
): Promise<EnrollmentLessonIntent | null> {
  const id = membershipEnrollmentId.trim();
  if (!id) return null;

  const { data, error } = await client
    .from("enrollment_lesson_intents")
    .select(INTENT_COLUMNS)
    .eq("membership_enrollment_id", id)
    .neq("status", "cancelled")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Impossibile caricare l'intento lezioni.");
  }
  if (!data) return null;

  const [item] = await enrichIntentRows(client, [data]);
  return item ?? null;
}

export async function reconcileEnrollmentLessonIntent(
  client: IntentsClient,
  intentId: string,
  actorMemberId: string,
): Promise<ReconcileEnrollmentLessonIntentResult> {
  const trimmedId = intentId.trim();
  const trimmedActor = actorMemberId.trim();
  if (!trimmedId) return fail("Richiesta non valida.");
  if (!trimmedActor) return fail("Operatore mancante.");

  const { data, error } = await client.rpc("reconcile_enrollment_lesson_intent", {
    p_intent_id: trimmedId,
    p_actor_member_id: trimmedActor,
  });

  if (error) {
    return fail(
      error.message || "Impossibile creare il corso e collegare il pagamento.",
    );
  }

  const message = rpcFailedMessage(
    data,
    "Impossibile creare il corso e collegare il pagamento.",
  );
  if (message) return fail(message);

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const courseId = data.course_id;
    if (typeof courseId === "string" && courseId.trim()) {
      return ok(courseId.trim());
    }
  }

  return ok(trimmedId);
}

export function enrollmentLessonIntentPaymentLabel(
  state: EnrollmentLessonIntentPaymentState,
): string {
  switch (state) {
    case "converted":
      return "Convertito";
    case "paid_unreconciled":
      return "Pagato, da collegare";
    default:
      return "Nessun pagamento";
  }
}
