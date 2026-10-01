import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import {
  setStaffMemberPassword,
  validateStaffPassword,
} from "@/lib/admin/staff-auth";
import { authPublicOrigin } from "@/lib/auth/redirect-url";
import { sendEnrollmentEmail } from "@/lib/iscrizione/email-transport";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface Body {
  memberId?: string;
  password?: string;
  /** Se false, imposta la password senza email (default: true). */
  notifyEmail?: boolean;
}

function buildPasswordResetEmail(params: {
  firstName: string;
  password: string;
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const name = params.firstName.trim() || "Ciao";
  const subject = "Accesso MusicPro School — nuova password";
  const text = [
    `${name},`,
    "",
    "l'amministrazione ha impostato la tua password di accesso a MusicPro School (area associati).",
    "",
    `Nuova password: ${params.password}`,
    "",
    `Accedi con email e password (non è un link di pagamento): ${params.loginUrl}`,
    "",
    "Ti consigliamo di cambiarla dalle Impostazioni dopo il primo accesso.",
    "",
    "— MusicPro School",
  ].join("\n");

  const html = `
<p>${escapeHtml(name)},</p>
<p>l'amministrazione ha impostato la tua password di accesso a MusicPro School (area associati).</p>
<p><strong>Nuova password:</strong> <code style="font-size:1.15em;letter-spacing:0.04em">${escapeHtml(params.password)}</code></p>
<p>Usa <strong>email + password</strong> nella scheda Password — non è un link di pagamento quota/Stripe.</p>
<p><a href="${escapeHtml(params.loginUrl)}">Vai al login MusicPro School</a></p>
<p>Ti consigliamo di cambiarla dalle Impostazioni dopo il primo accesso.</p>
<p>— MusicPro School</p>
`.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageMembers(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato." },
      { status: 403 },
    );
  }

  const memberId = body.memberId?.trim();
  const password = body.password ?? "";
  const notifyEmail = body.notifyEmail !== false;

  if (!memberId) {
    return NextResponse.json(
      { success: false, message: "Manca l'associato." },
      { status: 400 },
    );
  }

  const invalid = validateStaffPassword(password);
  if (invalid) {
    return NextResponse.json(
      { success: false, message: invalid },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();
  const { data: member, error: memberError } = await service
    .from("members")
    .select("id, first_name, last_name, email, is_active")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json(
      { success: false, message: memberError.message },
      { status: 500 },
    );
  }
  if (!member) {
    return NextResponse.json(
      { success: false, message: "Associato non trovato." },
      { status: 404 },
    );
  }

  const email = member.email?.trim() ?? "";
  if (!email) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Manca l'email sull'anagrafica: impossibile creare l'accesso o inviare la comunicazione.",
      },
      { status: 400 },
    );
  }

  try {
    await setStaffMemberPassword(service, memberId, password);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossibile aggiornare la password.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }

  if (!notifyEmail) {
    return NextResponse.json({
      success: true,
      message: "Password aggiornata (nessuna email inviata).",
      emailSent: false,
    });
  }

  const loginUrl = `${authPublicOrigin(process.env)}/login`;
  const mail = buildPasswordResetEmail({
    firstName: member.first_name,
    password,
    loginUrl,
  });

  const sent = await sendEnrollmentEmail({
    to: [email],
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    preferGoogleSmtp: true,
  });

  if (!sent.sent) {
    return NextResponse.json(
      {
        success: false,
        message: `Password aggiornata su Auth, ma email NON inviata a ${email}: ${sent.error ?? "trasporto assente"}. Comunica a mano la password all'associato.`,
        emailSent: false,
        emailError: sent.error ?? null,
        passwordUpdated: true,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Password aggiornata e inviata a ${email}.`,
    emailSent: true,
  });
}
