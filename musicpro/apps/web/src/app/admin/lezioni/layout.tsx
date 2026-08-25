import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <div className="md:sticky md:top-4 md:self-start">
        <AdminLezioniSubNav />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
