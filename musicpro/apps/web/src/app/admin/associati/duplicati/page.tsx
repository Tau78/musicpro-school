import Link from "next/link";
import { redirect } from "next/navigation";

import {
  findDuplicateMembers,
  getCurrentMemberWithRoles,
} from "@musicpro/database";

import { DuplicatesMergePanel } from "@/components/admin/duplicates-merge-panel";
import { canMergeDuplicates } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AssociatiDuplicatiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canMergeDuplicates(member.roles)) {
    redirect("/admin/associati");
  }

  const plans = await findDuplicateMembers(supabase);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-neutral-500">
          <Link href="/admin/associati" className="hover:underline">
            Rubrica
          </Link>
          {" / "}
          Compatta duplicati
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-[var(--brand)]">
          Compatta duplicati
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Trova associati con lo stesso nome e cognome (normalizzati) e unisce
          i record nel canonico, riassegnando i riferimenti collegati.
        </p>
      </div>

      <DuplicatesMergePanel plans={plans} />
    </div>
  );
}
