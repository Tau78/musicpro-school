import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import { currentFiscalYear, listAnnualQuotaSettings } from "@musicpro/database";

import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import {
  createStripePaymentLinkQuotaAssociativa,
  QUOTA_ASSOCIATIVA_CENTESIMI,
} from "@/lib/iscrizione/stripe-payment-link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Devi effettuare l'accesso." },
        { status: 401 },
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    const fiscalYear = currentFiscalYear();
    const settings = await listAnnualQuotaSettings(supabase);
    const setting = settings.find((entry) => entry.fiscalYear === fiscalYear);
    const importoCentesimi = setting
      ? Math.round(setting.amountEur * 100)
      : QUOTA_ASSOCIATIVA_CENTESIMI;

    const idIscrizione = randomUUID();
    const requestOrigin =
      request.headers.get("origin") || request.nextUrl.origin || "";
    const origin =
      requestOrigin && !isLocalDevOrigin(requestOrigin)
        ? requestOrigin.replace(/\/$/, "")
        : authPublicOrigin(process.env);
    const returnBase = `${origin.replace(/\/$/, "")}/onboarding/quota`;

    const { error: enrollmentError } = await supabase.from("enrollments").insert({
      id: idIscrizione,
      legacy_enrollment_id: idIscrizione,
      member_id: member.id,
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email ?? user.email ?? "",
      fiscal_year: fiscalYear,
      amount_centesimi: importoCentesimi,
      payment_status: "PENDING",
    });

    if (enrollmentError) {
      return NextResponse.json(
        {
          success: false,
          message:
            enrollmentError.message ??
            "Impossibile avviare il pagamento della quota.",
        },
        { status: 400 },
      );
    }

    const linkRes = await createStripePaymentLinkQuotaAssociativa({
      idIscrizione,
      memberId: member.id,
      nome: member.first_name,
      cognome: member.last_name,
      importoCentesimi: importoCentesimi,
      annoSocietario: fiscalYear,
      idempotencyKey: `onboarding_quota_${member.id}_${fiscalYear}`,
    });

    if (!linkRes.success || !linkRes.url) {
      await supabase
        .from("enrollments")
        .update({ payment_status: "ERRORE" })
        .eq("id", idIscrizione);

      return NextResponse.json(
        {
          success: false,
          message: linkRes.message ?? "Impossibile creare il link di pagamento.",
        },
        { status: 400 },
      );
    }

    await supabase
      .from("enrollments")
      .update({
        payment_status: "INVIATO",
        payment_link_url: linkRes.url,
        payment_link_id: linkRes.stripeId || null,
        payment_total_centesimi: linkRes.totaleCents || importoCentesimi,
      })
      .eq("id", idIscrizione);

    return NextResponse.json({ success: true, url: linkRes.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
