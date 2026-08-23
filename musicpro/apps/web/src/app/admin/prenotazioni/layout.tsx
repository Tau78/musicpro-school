import { Suspense } from "react";

import { PrenotazioniSideNav } from "@/components/admin/prenotazioni-side-nav";

export default function AdminPrenotazioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <Suspense fallback={null}>
        <PrenotazioniSideNav />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
