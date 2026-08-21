import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <AdminLezioniSubNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
