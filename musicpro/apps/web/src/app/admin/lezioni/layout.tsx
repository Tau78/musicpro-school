import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <AdminLezioniSubNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
