import { redirect } from "next/navigation";

import { BookingsAdminPanel } from "@/components/admin/bookings-admin-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";

export default async function AdminPrenotazioniPage() {
  const member = await getAdminMember();

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
