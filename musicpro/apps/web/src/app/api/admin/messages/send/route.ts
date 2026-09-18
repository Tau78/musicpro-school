import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  sendBulkMessages,
  type MessageChannel,
} from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import {
  createGoogleSmtpTransport,
  enrollmentFromAddress,
  googleSmtpConfigured,
} from "@/lib/iscrizione/email-transport";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface SendBody {
  memberIds?: string[];
  channel?: string;
  subject?: string;
  body?: string;
  templateId?: string | null;
  campaignName?: string;
  campaignId?: string | null;
}

function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r\n|\r|\n/g, "<br />");
}

export async function POST(request: Request) {
  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, message: "Non autenticato" },
      { status: 401 },
    );
  }

  const currentMember = await getCurrentMemberWithRoles(supabase);
  if (!currentMember || !canManageMembers(currentMember.roles)) {
    return NextResponse.json(
      { success: false, message: "Non autorizzato" },
      { status: 403 },
    );
  }

  const channel = body.channel?.trim() as MessageChannel | undefined;
  if (channel !== "email" && channel !== "telegram") {
    return NextResponse.json(
      { success: false, message: "Canale non valido (email o telegram)" },
      { status: 400 },
    );
  }

  const memberIds = Array.isArray(body.memberIds)
    ? body.memberIds.filter((id): id is string => typeof id === "string")
    : [];

  const smtp =
    channel === "email" &&
    !process.env.RESEND_API_KEY?.trim() &&
    googleSmtpConfigured()
      ? createGoogleSmtpTransport()
      : null;
  const from = smtp ? enrollmentFromAddress() : "";

  try {
    const result = await sendBulkMessages(supabase, {
      memberIds,
      channel,
      subject: body.subject ?? "",
      body: body.body ?? "",
      templateId: body.templateId ?? null,
      campaignName: body.campaignName,
      campaignId: body.campaignId,
      createdBy: currentMember.id,
      timeBudgetMs: 80_000,
      sendEmail: smtp
        ? async (item) => {
            try {
              await smtp.sendMail({
                from,
                to: item.to,
                subject: item.subject,
                text: item.body,
                html: textToHtml(item.body),
              });
              return { ok: true as const };
            } catch (err) {
              return {
                ok: false as const,
                error:
                  err instanceof Error ? err.message : "Invio SMTP fallito",
              };
            }
          }
        : undefined,
    });

    if (!result.success) {
      const message = result.errorMessage ?? "Invio fallito";
      const isValidation =
        /destinatario|obbligatorio|canale non valido|associato trovato|trasporto email/i.test(
          message,
        );
      return NextResponse.json(
        {
          success: false,
          message,
          sent: result.sent,
          failed: result.failed,
          skipped: result.skipped,
          campaignId: result.campaignId,
          pendingMemberIds: result.pendingMemberIds,
        },
        { status: isValidation ? 400 : 502 },
      );
    }

    const pending = result.pendingMemberIds?.length ?? 0;
    const doneLabel =
      pending > 0
        ? `Invio in corso. Inviati: ${result.sent}, falliti: ${result.failed}, saltati: ${result.skipped}, in coda: ${pending}.`
        : `Invio completato. Inviati: ${result.sent}, falliti: ${result.failed}, saltati: ${result.skipped}.`;

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      campaignId: result.campaignId,
      pendingMemberIds: result.pendingMemberIds ?? [],
      warnings: result.warnings,
      message: doneLabel,
    });
  } finally {
    smtp?.close();
  }
}
