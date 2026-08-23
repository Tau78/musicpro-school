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

  return <BookingAdminDetail booking={booking} rooms={rooms} />;
}
