import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { BookingsAdminPanel } from "@/components/admin/bookings-admin-panel";
import { canManageBookings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPrenotazioniPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageBookings(member.roles)) {
    redirect("/admin/associati");
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Prenotazioni sale
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Approva o rifiuta le richieste in fascia 6–12 ore e consulta le
          prenotazioni future.
        </p>
      </div>

      <BookingsAdminPanel />
    </div>
  );
}
