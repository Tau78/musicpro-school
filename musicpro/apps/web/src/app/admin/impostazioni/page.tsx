import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getAppBookingSettings,
  getCurrentMemberWithRoles,
} from "@musicpro/database";

import { BookingSettingsForm } from "@/components/admin/booking-settings-form";
import { canManageSettings } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function ImpostazioniPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManageSettings(member.roles)) {
    redirect("/admin/rimborsi");
  }

  const settings = await getAppBookingSettings(supabase);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Impostazioni
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Configurazione prenotazioni, documenti legacy e strumenti di
          migrazione.
        </p>
      </div>

      <nav className="mb-8 flex flex-wrap gap-2 border-b border-neutral-200 pb-3 text-sm">
        <span className="rounded-lg bg-[var(--brand)] px-3 py-1.5 font-medium text-white">
          Prenotazioni
        </span>
        <Link
          href="/admin/impostazioni/documenti"
          className="rounded-lg px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          Documenti / Drive
        </Link>
      </nav>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Impostazioni prenotazioni
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          Soglie globali per conferma, approvazione e annullamento delle
          prenotazioni sale.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Per le penali su cancellazione vedi{" "}
          <Link
            href="/admin/penali"
            className="text-[var(--brand)] hover:underline"
          >
            Admin → Penali
          </Link>
          .
        </p>
      </div>

      <BookingSettingsForm settings={settings} />

      <section className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-6">
        <h3 className="text-sm font-semibold text-neutral-900">
          Import dati storici (Sheets)
        </h3>
        <p className="mt-2 text-sm text-neutral-600">
          Il wizard di import GAS non è stato ripristinato nell&apos;admin web.
          Per re-importare o verificare i dati da Google Sheets usare lo script
          one-shot dalla root del repository:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-neutral-900 px-4 py-3 text-xs text-neutral-100">
          npm run migrate:sheets -- --dry-run{"\n"}
          npm run migrate:sheets
        </pre>
        <p className="mt-2 text-sm text-neutral-500">
          Documentazione:{" "}
          <code className="text-xs">scripts/migrate-from-sheets/README.md</code>{" "}
          e <code className="text-xs">docs/CUTOVER.md</code>.
        </p>
      </section>
    </div>
  );
}
