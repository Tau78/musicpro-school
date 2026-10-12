import { NextRequest, NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  notifyPackPaymentLink,
} from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  enrollmentId?: string;
  notify?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const actor = await getCurrentMemberWithRoles(supabase);
    if (!actor) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return NextResponse.json(
        { success: false, message: "Richiesta non valida." },
        { status: 400 },
      );
    }

    const enrollmentId = String(body.enrollmentId || "").trim();
    if (!enrollmentId) {
      return NextResponse.json(
        { success: false, message: "Iscrizione mancante." },
        { status: 400 },
      );
    }

    const { data: enrollment } = await supabase
      .from("course_enrollments")
      .select("id, member_id, course_id, left_at")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (!enrollment || enrollment.left_at) {
      return NextResponse.json(
        { success: false, message: "Iscrizione non trovata." },
        { status: 404 },
      );
    }

    const { data: course } = await supabase
      .from("courses")
      .select("id, name, titular_member_id, status, is_trial, price_eur")
      .eq("id", enrollment.course_id)
      .maybeSingle();

    if (!course || course.status !== "attivo" || course.is_trial) {
      return NextResponse.json(
        { success: false, message: "Corso non idoneo al pagamento pacchetto." },
        { status: 400 },
      );
    }

    const isStaff = canManageMembers(actor.roles);
    const isTitular = actor.id === course.titular_member_id;
    if (!isStaff && !isTitular) {
      return NextResponse.json(
        { success: false, message: "Non autorizzato." },
        { status: 403 },
      );
    }

    const origin =
      request.headers.get("origin")?.replace(/\/$/, "") ||
      process.env.NEXT_PUBLIC_SCHOOL_PUBLIC_URL?.replace(/\/$/, "") ||
      "https://school.musicproeventi.it";

    const checkoutRes = await fetch(`${origin}/api/lezioni/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ enrollmentId }),
    });

    const checkoutPayload = (await checkoutRes.json()) as {
      success?: boolean;
      url?: string;
      message?: string;
    };

    if (!checkoutRes.ok || !checkoutPayload.success || !checkoutPayload.url) {
      return NextResponse.json(
        {
          success: false,
          message:
            checkoutPayload.message ||
            "Impossibile creare il link di pagamento pacchetto.",
        },
        { status: 400 },
      );
    }

    if (body.notify !== false) {
      const service = createServiceRoleClient();
      await notifyPackPaymentLink(service, {
        memberId: enrollment.member_id,
        courseName: course.name,
        checkoutUrl: checkoutPayload.url,
      });
    }

    return NextResponse.json({
      success: true,
      url: checkoutPayload.url,
      notified: body.notify !== false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
