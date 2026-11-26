import { LastMinuteSalesReport } from "@/components/admin/last-minute-sales-report";

export default function AdminLastMinuteReportPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-base font-semibold text-neutral-900">Last minute</h1>
      <LastMinuteSalesReport />
    </div>
  );
}