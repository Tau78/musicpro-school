import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listCancellationPenaltyRules,
} from "@musicpro/database";

import { PenaltyRulesPanel } from "@/components/admin/penalty-rules-panel";
import { canManagePenalties } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function PenaliPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member || !canManagePenalties(member.roles)) {
    redirect("/admin/rimborsi");
  }

  let rules: Awaited<ReturnType<typeof listCancellationPenaltyRules>> = [];

  try {
    rules = await listCancellationPenaltyRules(supabase);
  } catch {
    rules = [];
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Penali cancellazione
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Fasce orarie con percentuale di penale applicata alla cancellazione
          associato. Il rimborso è calcolato come totale meno penale.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Per le soglie di annullamento vedi{" "}
          <Link
            href="/admin/impostazioni"
            className="text-[var(--brand)] hover:underline"
          >
            Admin → Impostazioni
          </Link>
          .
        </p>
      </div>

      <PenaltyRulesPanel rules={rules} />
    </div>
  );
}
