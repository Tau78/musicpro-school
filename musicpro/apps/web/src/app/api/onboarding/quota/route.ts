import { randomUUID } from "crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  listAnnualQuotaSettings,
  resolveOnlineQuotaFiscalYear,
  type Database,
} from "@musicpro/database";

import { authPublicOrigin, isLocalDevOrigin } from "@/lib/auth/redirect-url";
import {
  createNexiQuotaAssociativaPaymentLink,
  QUOTA_ASSOCIATIVA_CENTESIMI,
} from "@/lib/iscrizione/nexi-quota-payment-link";
import {
  getMembershipStatus,
  memberHasUsableAnagrafica,
} from "@/lib/membership";
import { canActorPayLessonFeesForMember } from "@/lib/lezioni/can-actor-pay-lesson-fees";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type FormPayload = Record<string, unknown>;

function formPayloadFromMember(member: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tax_code?: string | null;
  phone?: string | null;
  birth_place?: string | null;
  birth_province?: string | null;
  birth_date?: string | null;
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_province?: string | null;
  manual_tutor_first_name?: string | null;
  manual_tutor_last_name?: string | null;
  manual_tutor_phone?: string | null;
  manual_tutor_email?: string | null;
  manual_tutor_tax_code?: string | null;
  photo_consent?: boolean | null;
}): FormPayload {
  return {
    nome: String(member.first_name || "").trim(),
    cognome: String(member.last_name || "").trim(),
    email: String(member.email || "").trim().toLowerCase(),
    cf: String(member.tax_code || "").toUpperCase().trim(),
    telefono: String(member.phone || "").trim(),
    luogo_nascita: String(member.birth_place || "").trim(),
    prov_nascita: String(member.birth_province || "").toUpperCase().trim(),
    data_nascita: member.birth_date
      ? String(member.birth_date).substring(0, 10)
      : "",
    indirizzo: String(member.address_street || "").trim(),
    cap: String(member.address_postal_code || "").trim(),
    citta: String(member.address_city || "").trim(),
    prov: String(member.address_province || "").toUpperCase().trim(),
    tutore_nome: String(member.manual_tutor_first_name || "").trim(),
    tutore_cognome: String(member.manual_tutor_last_name || "").trim(),
    tutore_telefono: String(member.manual_tutor_phone || "").trim(),
    tutore_email: String(member.manual_tutor_email || "").trim(),
    tutore_cf: String(member.manual_tutor_tax_code || "").toUpperCase().trim(),
    corso: "",
    rinnovo_associato: true,
    photo_consent: Boolean(member.photo_consent),
    source: "onboarding_quota",
  };
}

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
      .select(
        "id, first_name, last_name, email, tax_code, phone, birth_place, birth_province, birth_date, address_street, address_postal_code, address_city, address_province, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_phone, manual_tutor_email, manual_tutor_tax_code, photo_consent, enrolled_at, gdpr_consent",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, message: "Profilo associato non trovato." },
        { status: 403 },
      );
    }

    let returnPath = "/onboarding/quota";
    let payMemberId = member.id;
    try {
      const body = (await request.json()) as {
        returnPath?: string;
        memberId?: string;
      };
      const candidate = String(body.returnPath || "").trim();
      const allowedReturnPaths = new Set([
        "/onboarding/quota",
        "/prenotazioni",
        "/dashboard",
        "/dashboard/rette",
      ]);
      if (allowedReturnPaths.has(candidate)) {
        returnPath = candidate;
      }
      const requestedMemberId = String(body.memberId || "").trim();
      if (requestedMemberId) {
        payMemberId = requestedMemberId;
      }
    } catch {
      // body assente o non JSON: default self
    }

    if (payMemberId !== member.id) {
      const allowed = await canActorPayLessonFeesForMember(
        supabase,
        member.id,
        payMemberId,
      );
      if (!allowed) {
        return NextResponse.json(
          {
            success: false,
            message: "Non autorizzato a pagare la quota per questo allievo.",
          },
          { status: 403 },
        );
      }
    }

    const service = createServiceRoleClient();

    const { data: payMember, error: payMemberError } = await service
      .from("members")
      .select(
        "id, user_id, first_name, last_name, email, tax_code, phone, birth_place, birth_province, birth_date, address_street, address_postal_code, address_city, address_province, manual_tutor_first_name, manual_tutor_last_name, manual_tutor_phone, manual_tutor_email, manual_tutor_tax_code, photo_consent, enrolled_at, gdpr_consent",
      )
      .eq("id", payMemberId)
      .maybeSingle();

    if (payMemberError || !payMember) {
      return NextResponse.json(
        { success: false, message: "Allievo non trovato." },
        { status: 404 },
      );
    }

    const membership = await getMembershipStatus(service, payMember.id);

    if (!membership.canPayQuota) {
      return NextResponse.json(
        {
          success: false,
          code: "FORM_REQUIRED",
          message:
            "Completa prima il modulo di iscrizione (anagrafica mancante sul profilo). Poi potrai pagare la quota.",
        },
        { status: 400 },
      );
    }

    const target = await resolveOnlineQuotaFiscalYear(service, payMember.id);
    if (target.alreadyPaid) {
      return NextResponse.json(
        {
          success: false,
          message: `La quota associativa ${target.fiscalYear} risulta già pagata.`,
        },
        { status: 400 },
      );
    }

    const fiscalYear = target.fiscalYear;
    const settings = await listAnnualQuotaSettings(service);
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
    const returnBase = `${origin.replace(/\/$/, "")}${returnPath}`;

    // Snapshot form_payload: prior enrollment con payload, altrimenti anagrafica members.
    // Così completaInvio post-Nexi non fallisce su enrollment «vuoto».
    let formPayload: FormPayload | null = null;
    const { data: priorEnrollment } = await service
      .from("enrollments")
      .select("form_payload")
      .eq("member_id", payMember.id)
      .not("form_payload", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      priorEnrollment?.form_payload &&
      typeof priorEnrollment.form_payload === "object" &&
      !Array.isArray(priorEnrollment.form_payload)
    ) {
      formPayload = {
        ...(priorEnrollment.form_payload as FormPayload),
        source: "onboarding_quota_prior",
      };
    } else if (memberHasUsableAnagrafica(payMember)) {
      formPayload = formPayloadFromMember(payMember);
    }

    // L'associato è già stato autenticato e collegato al proprio member sopra.
    // Le scritture su enrollments sono server-side: la RLS permette la gestione
    // solo allo staff, quindi il client di sessione causerebbe un 42501.
    const { error: enrollmentError } = await service.from("enrollments").insert({
      id: idIscrizione,
      legacy_enrollment_id: idIscrizione,
      member_id: payMember.id,
      first_name: payMember.first_name,
      last_name: payMember.last_name,
      email: payMember.email ?? user.email ?? "",
      tax_code: payMember.tax_code || null,
      phone: payMember.phone || null,
      fiscal_year: fiscalYear,
      amount_centesimi: importoCentesimi,
      payment_status: "PENDING",
      form_payload: (formPayload ??
        null) as Database["public"]["Tables"]["enrollments"]["Insert"]["form_payload"],
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

    const linkRes = await createNexiQuotaAssociativaPaymentLink({
      idIscrizione,
      memberId: payMember.id,
      nome: payMember.first_name,
      cognome: payMember.last_name,
      importoCentesimi: importoCentesimi,
      annoSocietario: fiscalYear,
      returnBaseUrl: returnBase,
      email: payMember.email ?? user.email,
      idempotencyKey: `onboarding_quota_${payMember.id}_${fiscalYear}`,
    });

    if (!linkRes.success || !linkRes.url) {
      await service
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

    await service
      .from("enrollments")
      .update({
        payment_status: "INVIATO",
        payment_link_url: linkRes.url,
        payment_link_id: linkRes.stripeId || null,
        payment_total_centesimi: linkRes.totaleCents || importoCentesimi,
      })
      .eq("id", idIscrizione);

    return NextResponse.json({
      success: true,
      url: linkRes.url,
      fiscalYear,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
