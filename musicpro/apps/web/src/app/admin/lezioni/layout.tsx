import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <AdminLezioniSubNav />
      {children}
    </div>
  );
}
