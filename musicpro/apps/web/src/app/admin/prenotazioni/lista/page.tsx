import { redirect } from "next/navigation";

import { BookingsAdminPanel } from "@/components/admin/bookings-admin-panel";
import { parsePrenotazioniLista } from "@/lib/admin/prenotazioni-nav";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageBookings } from "@/lib/admin/roles";

interface PageProps {
  searchParams: Promise<{ lista?: string }>;
}

export default async function AdminPrenotazioniListaPage({
  searchParams,
}: PageProps) {
  const member = await getAdminMember();
  const { lista } = await searchParams;

  if (!member || !canManageBookings(member.roles)) {
    redirect("/admin/associati");
  }

  const parsed = parsePrenotazioniLista(lista);
  const filter =
    parsed === "prossime"
      ? "upcoming"
      : parsed === "tutte"
        ? "all"
        : parsed === "cestino"
          ? "cancelled"
          : "pending_approval";

  const title =
    parsed === "prossime"
      ? "Prossime prenotazioni"
      : parsed === "tutte"
        ? "Tutte le prenotazioni"
        : parsed === "cestino"
          ? "Cestino"
          : "Da approvare";

  const subtitle =
    parsed === "da-approvare"
      ? "Approva o rifiuta le richieste in fascia 6–12 ore e consulta le prenotazioni future."
      : parsed === "prossime"
        ? "Prenotazioni confermate o in attesa con data futura."
        : parsed === "cestino"
          ? "Prenotazioni annullate. Restano in elenco, non si cancellano dal database."
          : "Elenco completo delle prenotazioni sale.";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>
      </div>
      <BookingsAdminPanel initialFilter={filter} />
    </div>
  );
}
