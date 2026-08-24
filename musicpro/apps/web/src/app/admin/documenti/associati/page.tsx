import { redirect } from "next/navigation";

import { listMembersDetail } from "@musicpro/database";

import { AssociatesBookButton } from "@/components/admin/associates-book-button";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentiLibroAssociatiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags(supabase);

  if (
    !member ||
    !canAccessDocumentiSubsection(member.roles, "libro_associati", flags)
  ) {
    redirect(
      firstDocumentiHref({
        showAssociati: false,
        showVerbali: canAccessDocumentiSubsection(
          member?.roles ?? [],
          "verbali",
          flags,
        ),
        showCespiti: canAccessDocumentiSubsection(
          member?.roles ?? [],
          "libro_cespiti",
          flags,
        ),
        showPermessi: false,
      }),
    );
  }

  const members = await listMembersDetail(supabase);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--brand)]">
            Libro associati
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Genera il registro anagrafico completo degli associati in formato
            stampabile o PDF. Aggiornalo almeno una volta l&apos;anno per
            adempiere agli obblighi associativi.
          </p>
        </div>
        <AssociatesBookButton members={members} />
      </div>
    </div>
  );
}
