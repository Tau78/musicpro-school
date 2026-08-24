import { redirect } from "next/navigation";

import { VerbaliScadenziarioPanel } from "@/components/admin/verbali-scadenziario-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import { createClient } from "@/lib/supabase/server";

const CASELLARIO_CATEGORIES = [
  {
    id: "assemblea",
    label: "Assemblea",
    description: "Verbali di assemblee ordinarie e straordinarie.",
  },
  {
    id: "consiglio",
    label: "Consiglio direttivo",
    description: "Verbali delle riunioni del consiglio direttivo.",
  },
  {
    id: "altro",
    label: "Altro",
    description: "Open day, riunioni di staff, incontri con enti e partner.",
  },
] as const;

export default async function VerbaliPage() {
  const supabase = await createClient();
  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags(supabase);

  if (
    !member ||
    !canAccessDocumentiSubsection(member.roles, "verbali", flags)
  ) {
    redirect(
      firstDocumentiHref({
        showAssociati: canAccessDocumentiSubsection(
          member?.roles ?? [],
          "libro_associati",
          flags,
        ),
        showVerbali: false,
        showCespiti: canAccessDocumentiSubsection(
          member?.roles ?? [],
          "libro_cespiti",
          flags,
        ),
        showPermessi: false,
      }),
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Verbali</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Scadenziario obblighi documentali e casellario verbali associativi.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h3 className="text-base font-semibold text-[var(--brand)]">
              Scadenziario
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Obblighi ricorrenti per associazioni iscritte al RUNTS.
            </p>
          </div>
          <div className="px-4 py-4">
            <VerbaliScadenziarioPanel />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-[var(--brand)]">
                Casellario
              </h3>
              <p className="mt-0.5 text-xs text-neutral-500">
                Archivio verbali per tipologia di riunione.
              </p>
            </div>
            <button
              type="button"
              disabled
              className="rounded-lg bg-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-500"
              title="Disponibile in una prossima versione"
            >
              Nuovo verbale
            </button>
          </div>

          <div className="space-y-4 px-4 py-4">
            {CASELLARIO_CATEGORIES.map((category) => (
              <div
                key={category.id}
                className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3"
              >
                <p className="text-sm font-semibold text-neutral-800">
                  {category.label}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {category.description}
                </p>
                <p className="mt-3 text-sm text-neutral-400">
                  Nessun verbale archiviato.
                </p>
              </div>
            ))}

            <div className="rounded-xl border border-neutral-100 bg-[var(--brand)]/5 px-4 py-6 text-center">
              <p className="text-sm font-medium text-[var(--brand)]">
                Prossimamente: generazione e archivio verbali
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Template, firme e export PDF saranno disponibili qui.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
