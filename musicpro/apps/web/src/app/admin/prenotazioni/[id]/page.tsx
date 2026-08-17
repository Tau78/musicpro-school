import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getAdminBookingById,
  listAllRooms,
} from "@musicpro/database";

import { BookingAdminDetail } from "@/components/admin/booking-admin-detail";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBookingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getAdminMember();

  if (!currentMember || !canManageBookings(currentMember.roles)) {
    redirect("/admin/associati");
  }

  const [booking, rooms] = await Promise.all([
    getAdminBookingById(supabase, id),
    listAllRooms(supabase),
  ]);

  if (!booking) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/prenotazioni"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna alle prenotazioni
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand)]">
          Dettaglio prenotazione
        </h2>
        <p className="mt-1 font-mono text-xs text-neutral-500">{booking.id}</p>
      </div>

      <BookingAdminDetail booking={booking} rooms={rooms} />
    </div>
  );
}
