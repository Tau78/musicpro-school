import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import {
  ensureOpenPackFee,
  getCurrentMemberWithRoles,
  todayInRome,
  type Database,
} from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { QUOTA_ASSOCIATIVA_CENTESIMI } from "@/lib/iscrizione/stripe-payment-link";
import { createLessonPackPaymentLink } from "@/lib/stripe/lesson-pack-payment-link";
import { eurosToCents } from "@/lib/stripe/room-payment-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface CheckoutBody {
  enrollmentId?: string;
}

type UserClient = Awaited<ReturnType<typeof createClient>>;
type DbClient = SupabaseClient<Database>;

function writeClient(fallback: UserClient): DbClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (url && key) {
    return createServiceClient<Database>(url, key);
  }
  return fallback;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

async function ensureOpenQuotaFee(
  client: DbClient,
  opts: {
    memberId: string;
    amountEur: number;
    dueOn: string;
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: existing, error: existingError } = await client
    .from("lesson_fees")
    .select("id")
    .eq("member_id", opts.memberId)
    .eq("kind", "quota")
    .in("status", ["aperta", "parziale"])
    .limit(1);

  if (existingError) {
    return {
      ok: false,
      message: existingError.message || "Impossibile verificare la retta quota.",
    };
  }
  if ((existing ?? []).length > 0) {
    return { ok: true };
  }

  const { error } = await client.from("lesson_fees").insert({
    member_id: opts.memberId,
    course_id: null,
    kind: "quota",
    status: "aperta",
    amount_eur: opts.amountEur,
    remaining_eur: opts.amountEur,
    due_on: opts.dueOn,
  });

  if (error) {
    return {
      ok: false,
      message: error.message || "Impossibile aprire la retta della quota.",
    };
  }
  return { ok: true };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const actor = await getCurrentMemberWithRoles(supabase);

    if (!actor) {
      return jsonError("Devi effettuare l'accesso.", 401);
    }

    let body: CheckoutBody;
    try {
      body = (await request.json()) as CheckoutBody;
    } catch {
      return jsonError("Richiesta non valida.", 400);
    }

    const enrollmentId = String(body.enrollmentId || "").trim();
    if (!enrollmentId) {
      return jsonError("Iscrizione corso mancante.", 400);
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from("course_enrollments")
      .select("id, course_id, member_id, left_at")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (enrollmentError) {
      return jsonError(
        enrollmentError.message || "Impossibile caricare l'iscrizione.",
        500,
      );
    }
    if (!enrollment || enrollment.left_at) {
      return jsonError("Iscrizione al corso non trovata.", 404);
    }

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, is_trial, price_eur, titular_member_id")
      .eq("id", enrollment.course_id)
      .maybeSingle();

    if (courseError) {
      return jsonError(courseError.message || "Impossibile caricare il corso.", 500);
    }
    if (!course) {
      return jsonError("Corso non trovato.", 404);
    }

    const isStaff = canManageMembers(actor.roles);
    const isTitular = actor.id === course.titular_member_id;
    if (!isStaff && !isTitular) {
      return jsonError("Non autorizzato a generare il link di pagamento.", 403);
    }

    const priceEur = Number(course.price_eur ?? 0);
    if (course.is_trial || !Number.isFinite(priceEur) || priceEur <= 0) {
      return jsonError(
        "Questo corso non richiede un pacchetto a pagamento.",
        400,
      );
    }

    const { data: student, error: studentError } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("id", enrollment.member_id)
      .maybeSingle();

    if (studentError || !student) {
      return jsonError("Allievo non trovato.", 404);
    }

    const { data: quotaOk } = await supabase.rpc("member_quota_ok", {
      p_member_id: student.id,
    });
    const includeQuota = quotaOk !== true;

    const dueOn = todayInRome();
    const writer = writeClient(supabase);

    const packFee = await ensureOpenPackFee(writer, enrollment.id);
    if (!packFee.success) {
      return jsonError(
        packFee.errorMessage ?? "Impossibile aprire la retta del pacchetto.",
        500,
      );
    }

    const quotaAmountCents = QUOTA_ASSOCIATIVA_CENTESIMI;
    const quotaAmountEur = Number((quotaAmountCents / 100).toFixed(2));

    if (includeQuota) {
      const quotaFee = await ensureOpenQuotaFee(writer, {
        memberId: student.id,
        amountEur: quotaAmountEur,
        dueOn,
      });
      if (!quotaFee.ok) {
        return jsonError(quotaFee.message, 500);
      }
    }

    const { data: familyKeyRaw, error: familyError } = await supabase.rpc(
      "lesson_family_key",
      { p_member_id: student.id },
    );
    if (familyError) {
      return jsonError(
        familyError.message || "Impossibile calcolare la chiave famiglia.",
        500,
      );
    }
    const familyKey =
      (familyKeyRaw && String(familyKeyRaw).trim()) || `member:${student.id}`;

    const packCents = eurosToCents(priceEur);
    const totaleCents = packCents + (includeQuota ? quotaAmountCents : 0);
    const amountEur = Number((totaleCents / 100).toFixed(2));

    const { data: payment, error: paymentError } = await writer
      .from("lesson_pack_payments")
      .insert({
        family_key: familyKey,
        member_id: student.id,
        amount_eur: amountEur,
        method: "stripe",
        status: "pending",
        include_quota: includeQuota,
        created_by: actor.id,
      })
      .select("id")
      .single();

    if (paymentError || !payment) {
      return jsonError(
        paymentError?.message || "Impossibile registrare il pagamento.",
        500,
      );
    }

    const origin =
      request.headers.get("origin") ||
      request.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "";
    const returnUrl = origin
      ? `${origin.replace(/\/$/, "")}/admin/lezioni/rette?pagato=1`
      : undefined;

    const studentName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
    const linkRes = await createLessonPackPaymentLink({
      paymentId: payment.id,
      enrollmentId: enrollment.id,
      memberId: student.id,
      studentName,
      packAmountEur: priceEur,
      includeQuota,
      quotaAmountCents,
      returnUrl,
      idempotencyKey: `lesson-pack-${payment.id}`,
    });

    if (!linkRes.success || !linkRes.url) {
      return jsonError(
        linkRes.message ?? "Impossibile creare il link di pagamento.",
        400,
      );
    }

    const { error: updateError } = await writer
      .from("lesson_pack_payments")
      .update({
        stripe_payment_link_id: linkRes.stripeId || null,
        stripe_payment_link_url: linkRes.url,
      })
      .eq("id", payment.id);

    if (updateError) {
      return jsonError(
        updateError.message || "Link creato, ma non è stato salvato.",
        500,
      );
    }

    return NextResponse.json({
      success: true,
      url: linkRes.url,
      paymentId: payment.id,
      includeQuota,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
