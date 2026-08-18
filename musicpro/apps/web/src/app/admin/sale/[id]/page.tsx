import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getAdminRoomById,
} from "@musicpro/database";

import { RoomForm } from "@/components/admin/room-form";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageRooms } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SalaDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getAdminMember();

  if (!currentMember || !canManageRooms(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const room = await getAdminRoomById(supabase, id);

  if (!room) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/sale"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna alle sale
        </Link>
        <h2 className="mt-2 text-3xl font-semibold text-[var(--brand)]">
          {room.name}
        </h2>
      </div>

      <RoomForm room={room} />
    </div>
  );
}
