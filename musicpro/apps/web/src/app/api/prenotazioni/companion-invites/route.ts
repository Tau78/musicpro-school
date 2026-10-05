import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import {
  attachCompanionInvitesToBooking,
  lookupCompanionQuota,
  parseCompanionGuests,
  sendCompanionInvites,
  type CompanionGuestInput,
} from "@/lib/booking/companion-invites";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const current = await getCurrentMemberWithRoles(supabase);
  if (!current) {
    return NextResponse.json(
      { success: false, message: "Non autenticato." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const firstName = searchParams.get("firstName")?.trim() ?? "";
  const lastName = searchParams.get("lastName")?.trim() ?? "";
  if (!firstName || !lastName) {
    return NextResponse.json(
      { success: false, message: "Nome e cognome obbligatori." },
      { status: 400 },
    );
  }

  try {
    const lookup = await lookupCompanionQuota(
      createServiceRoleClient(),
      firstName,
      lastName,
    );
    return NextResponse.json({ success: true, ...lookup });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const current = await getCurrentMemberWithRoles(supabase);
  if (!current) {
    return NextResponse.json(
      { success: false, message: "Non autenticato." },
      { status: 401 },
    );
  }

  let body: {
    guests?: CompanionGuestInput[];
    bookingId?: string;
    inviteIds?: string[];
    declaration?: "all_ok" | "need_quota";
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, message: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const service = createServiceRoleClient();

  if (body.bookingId) {
    const declaration =
      body.declaration === "need_quota" ? "need_quota" : "all_ok";
    await attachCompanionInvitesToBooking(
      service,
      current.id,
      body.bookingId.trim(),
      body.inviteIds ?? [],
      declaration,
    );
    return NextResponse.json({ success: true });
  }

  const { guests, errors } = parseCompanionGuests(body.guests ?? []);
  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, message: errors[0], errors },
      { status: 400 },
    );
  }
  if (guests.length === 0) {
    return NextResponse.json(
      { success: false, message: "Compila almeno una riga con nome, cognome e email." },
      { status: 400 },
    );
  }

  try {
    const results = await sendCompanionInvites({
      db: service,
      invitedByMemberId: current.id,
      bookerFirstName: current.firstName,
      bookerLastName: current.lastName,
      guests,
    });
    const sent = results.filter((row) => row.sent).length;
    const skipped = results.filter((row) => row.skipped).length;
    const failed = results.filter((row) => !row.sent && !row.skipped).length;
    return NextResponse.json({
      success: failed === 0,
      sent,
      skipped,
      results,
      message:
        failed > 0
          ? results.find((row) => !row.sent && !row.skipped)?.message ??
            "Invio non riuscito."
          : sent === 0 && skipped > 0
            ? skipped === 1
              ? "Ok Quota: nessuna email inviata."
              : `Ok Quota per ${skipped} persone: nessuna email inviata.`
            : skipped > 0
              ? `Email inviate: ${sent}. ${skipped} già in regola.`
              : `Email inviate: ${sent}.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
