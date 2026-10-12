import { Suspense } from "react";

import { PrenotazioniWorkspaceNav } from "@/components/admin/prenotazioni-workspace-nav";

export default function AdminPrenotazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <Suspense fallback={null}>
        <PrenotazioniWorkspaceNav />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
