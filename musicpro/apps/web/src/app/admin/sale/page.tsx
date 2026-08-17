import { redirect } from "next/navigation";

import { listAllRooms } from "@musicpro/database";

import { RoomList } from "@/components/admin/room-list";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageRooms } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function SalePage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageRooms(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const rooms = await listAllRooms(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Sale prova
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Configura tariffe, orari, durate e colori calendario per ogni sala.
        </p>
      </div>

      <RoomList rooms={rooms} />
    </div>
  );
}
