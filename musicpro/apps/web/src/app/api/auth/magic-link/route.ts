import { NextResponse } from "next/server";

import { safeAuthNextPath } from "@/lib/auth/redirect-url";
import { sendMagicLinkEmail } from "@/lib/auth/send-magic-link";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  email?: string;
  redirect?: string;
}

const GENERIC_OK =
  "Ti abbiamo inviato un link di accesso. Controlla la posta (anche spam) e clicca entro pochi minuti.";

const GENERIC_UNKNOWN =
  "Se l'email è in anagrafica associati, controlla la posta (anche spam). Altrimenti contatta la segreteria.";

/** Magic link via Google SMTP / Resend (non mailer Supabase). */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { success: false, message: "Inserisci un'email valida." },
      { status: 400 },
    );
  }

  const redirectTo = safeAuthNextPath(body.redirect, "/dashboard");

  try {
    const service = createServiceRoleClient();
    const result = await sendMagicLinkEmail(service, email, redirectTo);

    if (result.sent) {
      return NextResponse.json({ success: true, message: GENERIC_OK });
    }

    if (result.reason === "smtp_failed") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Impossibile inviare il link in questo momento. Riprova tra poco o contatta la segreteria.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, message: GENERIC_UNKNOWN });
  } catch (err) {
    console.error("[magic-link]", err);
    return NextResponse.json(
      {
        success: false,
        message:
          "Impossibile inviare il link in questo momento. Riprova tra poco.",
      },
      { status: 500 },
    );
  }
}