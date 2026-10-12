import { BookingUsageReport } from "@/components/admin/booking-usage-report";

export default function AdminStatsUtilizzoPage() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500">
        Prenotazioni per giorno e per sala nel periodo scelto.
      </p>
      <BookingUsageReport />
    </div>
  );
}
