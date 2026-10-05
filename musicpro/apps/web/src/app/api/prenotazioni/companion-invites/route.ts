import { NextResponse } from "next/server";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import {
  attachCompanionInvitesToBooking,
  parseCompanionGuests,
  sendCompanionInvites,
  type CompanionGuestInput,
} from "@/lib/booking/companion-invites";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

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

  if (body.bookingId && Array.isArray(body.inviteIds)) {
    await attachCompanionInvitesToBooking(
      service,
      current.id,
      body.bookingId.trim(),
      body.inviteIds,
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
    return NextResponse.json({
      success: sent > 0,
      sent,
      results,
      message:
        sent === results.length
          ? `Email inviate: ${sent}.`
          : sent > 0
            ? `Inviate ${sent} di ${results.length} email.`
            : results[0]?.message ?? "Invio non riuscito.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
