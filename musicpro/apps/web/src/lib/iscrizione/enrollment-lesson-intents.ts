import type { SupabaseClient } from "@supabase/supabase-js";

import {
  todayInRome,
  upsertIntentFromEnrollment,
  type Database,
  type EnrollmentLessonIntent,
} from "@musicpro/database";

import { QUOTA_ASSOCIATIVA_CENTESIMI, eurosToCents } from "@/lib/nexi/cod-trans";
import {
  createEnrollmentLessonPackPaymentLink,
  findReusableEnrollmentLessonPackPayment,
} from "@/lib/nexi/enrollment-lesson-pack-payment-link";

import type { EnrollmentFormData } from "./enrollment-service";

type Db = SupabaseClient<Database>;

function isFormFlagTrue(value: unknown): boolean {
  return (
    value === true ||
    String(value || "").toLowerCase() === "true" ||
    String(value || "") === "on"
  );
}

export function lezioniEnabledFromForm(data: EnrollmentFormData): boolean {
  return isFormFlagTrue(data.lezioni_enabled);
}

export function payFirstPackWithQuotaFromForm(data: EnrollmentFormData): boolean {
  return isFormFlagTrue(data.pay_first_pack_with_quota);
}

function lessonCourseIdFromForm(data: EnrollmentFormData): string {
  return String(data.lesson_course_id || "").trim();
}

function lessonTeacherIdFromForm(data: EnrollmentFormData): string | null {
  const id = String(data.lesson_teacher_member_id || "").trim();
  return id || null;
}

async function ensureOpenQuotaFeeForEnrollment(
  db: Db,
  memberId: string,
  amountEur: number,
): Promise<void> {
  const dueOn = todayInRome();
  const { data: existing, error: existingError } = await db
    .from("lesson_fees")
    .select("id")
    .eq("member_id", memberId)
    .eq("kind", "quota")
    .in("status", ["aperta", "parziale"])
    .limit(1);

  if (existingError) {
    throw new Error(
      existingError.message || "Impossibile verificare la retta quota.",
    );
  }
  if ((existing ?? []).length > 0) return;

  const { error } = await db.from("lesson_fees").insert({
    member_id: memberId,
    course_id: null,
    kind: "quota",
    status: "aperta",
    amount_eur: amountEur,
    remaining_eur: amountEur,
    due_on: dueOn,
  });
  if (error) {
    throw new Error(error.message || "Impossibile aprire la retta quota.");
  }
}

async function validateLessonCourse(
  db: Db,
  courseId: string,
  teacherMemberId: string | null,
): Promise<{ priceEur: number }> {
  const { data: course, error } = await db
    .from("courses")
    .select("id, status, is_trial, price_eur, titular_member_id")
    .eq("id", courseId)
    .maybeSingle();

  if (error || !course) {
    throw new Error("Corso lezioni non valido.");
  }
  if (course.status !== "attivo" || course.is_trial) {
    throw new Error("Corso lezioni non disponibile per l'iscrizione.");
  }
  const priceEur = Number(course.price_eur ?? 0);
  if (!Number.isFinite(priceEur) || priceEur <= 0) {
    throw new Error("Corso lezioni senza prezzo pacchetto.");
  }

  if (teacherMemberId) {
    const titular = course.titular_member_id;
    if (teacherMemberId !== titular) {
      const today = todayInRome();
      const { data: teacherRow } = await db
        .from("course_teachers")
        .select("id, ends_on")
        .eq("course_id", courseId)
        .eq("member_id", teacherMemberId)
        .maybeSingle();
      const endsOn = teacherRow?.ends_on
        ? String(teacherRow.ends_on).substring(0, 10)
        : null;
      if (!teacherRow || (endsOn && endsOn < today)) {
        throw new Error("Docente non valido per il corso selezionato.");
      }
    }
  }

  return { priceEur };
}

export async function upsertEnrollmentLessonIntent(
  db: Db,
  input: {
    enrollmentId: string;
    memberId: string;
    data: EnrollmentFormData;
  },
): Promise<EnrollmentLessonIntent | null> {
  if (!lezioniEnabledFromForm(input.data)) {
    const { data: existing } = await db
      .from("enrollment_lesson_intents")
      .select("id")
      .eq("membership_enrollment_id", input.enrollmentId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (existing?.id) {
      await db
        .from("enrollment_lesson_intents")
        .update({ status: "cancelled" })
        .eq("id", existing.id);
    }
    return null;
  }

  const requestedCourseId = lessonCourseIdFromForm(input.data);
  if (!requestedCourseId) {
    throw new Error("Seleziona un corso per le lezioni.");
  }

  const preferredTeacherMemberId = lessonTeacherIdFromForm(input.data);
  await validateLessonCourse(db, requestedCourseId, preferredTeacherMemberId);

  return upsertIntentFromEnrollment(db, {
    membershipEnrollmentId: input.enrollmentId,
    memberId: input.memberId,
    requestedCourseId,
    preferredTeacherMemberId,
    payFirstPackWithQuota: payFirstPackWithQuotaFromForm(input.data),
    status: "pending",
  });
}

export async function startEnrollmentCombinedLessonPayment(input: {
  db: Db;
  enrollmentId: string;
  memberId: string;
  intent: EnrollmentLessonIntent;
  nome: string;
  cognome: string;
  email?: string | null;
  importoQuotaCents: number;
  quotaAlreadyPaid: boolean;
}): Promise<{
  checkoutUrl: string;
  stripeId?: string;
  totaleCents: number;
  paymentId: string;
  reused?: boolean;
}> {
  const { db, enrollmentId, memberId, intent } = input;
  if (!intent.payFirstPackWithQuota) {
    throw new Error("Pagamento combinato non richiesto.");
  }

  const { priceEur } = await validateLessonCourse(
    db,
    intent.requestedCourseId,
    intent.preferredTeacherMemberId,
  );

  const includeQuota = !input.quotaAlreadyPaid;
  const quotaCents = includeQuota ? input.importoQuotaCents : 0;
  const packCents = eurosToCents(priceEur);
  const totaleCents = packCents + (includeQuota ? quotaCents : 0);
  const amountEur = Number((totaleCents / 100).toFixed(2));

  if (includeQuota) {
    const quotaEur = Number((quotaCents / 100).toFixed(2));
    await ensureOpenQuotaFeeForEnrollment(db, memberId, quotaEur);
  }

  const { data: familyKeyRaw, error: familyError } = await db.rpc(
    "lesson_family_key",
    { p_member_id: memberId },
  );
  if (familyError) {
    throw new Error(
      familyError.message || "Impossibile calcolare la chiave famiglia.",
    );
  }
  const familyKey =
    (familyKeyRaw && String(familyKeyRaw).trim()) || `member:${memberId}`;

  const reusable = await findReusableEnrollmentLessonPackPayment({
    enrollmentId,
    intentId: intent.id,
    memberId,
    amountEur,
    includeQuota,
  });
  if (reusable) {
    return {
      checkoutUrl: reusable.url,
      stripeId: reusable.stripeId || undefined,
      totaleCents,
      paymentId: reusable.paymentId,
      reused: true,
    };
  }

  const { data: payment, error: paymentError } = await db
    .from("lesson_pack_payments")
    .insert({
      family_key: familyKey,
      member_id: memberId,
      amount_eur: amountEur,
      method: "nexi",
      status: "pending",
      include_quota: includeQuota,
      enrollment_lesson_intent_id: intent.id,
      note: "iscrizione_combined",
    })
    .select("id")
    .single();

  if (paymentError || !payment) {
    throw new Error(
      paymentError?.message || "Impossibile registrare il pagamento lezioni.",
    );
  }

  const linkRes = await createEnrollmentLessonPackPaymentLink({
    paymentId: payment.id,
    enrollmentLessonIntentId: intent.id,
    iscrizioneEnrollmentId: enrollmentId,
    memberId,
    nome: input.nome,
    cognome: input.cognome,
    packAmountEur: priceEur,
    includeQuota,
    quotaAmountCents: quotaCents || QUOTA_ASSOCIATIVA_CENTESIMI,
    email: input.email,
    idempotencyKey: `iscrizione_lesson_${intent.id}`,
  });

  if (!linkRes.success || !linkRes.url) {
    throw new Error(
      linkRes.message || "Impossibile creare il link di pagamento combinato.",
    );
  }

  await db
    .from("lesson_pack_payments")
    .update({
      stripe_payment_link_id: linkRes.stripeId || null,
      stripe_payment_link_url: linkRes.url,
    })
    .eq("id", payment.id);

  await upsertIntentFromEnrollment(db, {
    membershipEnrollmentId: enrollmentId,
    memberId,
    requestedCourseId: intent.requestedCourseId,
    preferredTeacherMemberId: intent.preferredTeacherMemberId,
    payFirstPackWithQuota: true,
    lessonPackPaymentId: payment.id,
    status: "pending",
  });

  return {
    checkoutUrl: linkRes.url,
    stripeId: linkRes.stripeId,
    totaleCents: linkRes.totaleCents ?? totaleCents,
    paymentId: payment.id,
  };
}
