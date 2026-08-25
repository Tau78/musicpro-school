import { redirect } from "next/navigation";

import { BookingUsageReport } from "@/components/admin/booking-usage-report";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";

export default async function PrenotazioniReportPage() {
  const member = await getAdminMember();

  if (!member || !canManageBookings(member.roles)) {
    redirect("/admin/associati");
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Report utilizzo
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Prenotazioni per giorno e per sala, aggancio al periodo scelto.
        </p>
      </div>
      <BookingUsageReport />
    </div>
  );
}
