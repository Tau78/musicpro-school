import { redirect } from "next/navigation";

import { listAllRooms } from "@musicpro/database";

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
  const first = rooms[0];

  if (first) {
    redirect(`/admin/sale/${first.id}`);
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--brand)]">Sale</h2>
      <p className="mt-2 text-sm text-neutral-600">Nessuna sala da mostrare.</p>
    </div>
  );
}
