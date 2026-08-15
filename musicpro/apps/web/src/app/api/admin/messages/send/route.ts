import { NextResponse } from "next/server";

import {
  getCurrentMemberWithRoles,
  sendBulkMessages,
  type MessageChannel,
} from "@musicpro/database";

import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface SendBody {
  memberIds?: string[];
  channel?: string;
  subject?: string;
  body?: string;
  templateId?: string | null;
  campaignName?: string;
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

  const result = await sendBulkMessages(supabase, {
    memberIds,
    channel,
    subject: body.subject ?? "",
    body: body.body ?? "",
    templateId: body.templateId ?? null,
    campaignName: body.campaignName,
    createdBy: currentMember.id,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        message: result.errorMessage ?? "Invio fallito",
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        campaignId: result.campaignId,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    campaignId: result.campaignId,
    warnings: result.warnings,
    message: `Invio completato. Inviati: ${result.sent}, falliti: ${result.failed}, saltati: ${result.skipped}.`,
  });
}
