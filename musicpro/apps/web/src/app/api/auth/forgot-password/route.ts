import { NextResponse } from "next/server";

import { sendPasswordRecoveryEmail } from "@/lib/auth/send-password-recovery";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  email?: string;
}

const GENERIC_OK =
  "Se l'indirizzo è registrato, riceverai a breve un'email con il link per impostare la password.";

const GENERIC_UNKNOWN =
  "Se l'email è in anagrafica associati, controlla la posta (anche spam). Altrimenti contatta la segreteria.";

/**
 * Reset password via Google SMTP (stesso trasporto delle prenotazioni),
 * invece del mailer Auth Supabase — più affidabile in produzione.
 */
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

  try {
    const service = createServiceRoleClient();
    const result = await sendPasswordRecoveryEmail(service, email);

    if (result.sent) {
      return NextResponse.json({ success: true, message: GENERIC_OK });
    }

    if (result.reason === "smtp_failed") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Impossibile inviare l'email di reset in questo momento. Riprova tra poco o contatta la segreteria.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, message: GENERIC_UNKNOWN });
  } catch (err) {
    console.error("[forgot-password]", err);
    return NextResponse.json(
      {
        success: false,
        message:
          "Impossibile inviare l'email di reset in questo momento. Riprova tra poco.",
      },
      { status: 500 },
    );
  }
}
