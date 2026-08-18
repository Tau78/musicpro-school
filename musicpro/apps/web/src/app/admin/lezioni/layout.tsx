import { AdminLezioniSubNav } from "@/components/lezioni/admin-lezioni-sub-nav";

export default function AdminLezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mt-2">
      <AdminLezioniSubNav />
      {children}
    </div>
  );
}
