import { redirect } from "next/navigation";

import {
  listAnnualQuotaSettings,
  listMemberAnnualQuotas,
  listMembers,
} from "@musicpro/database";

import { QuotasPanel } from "@/components/admin/quotas-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageQuotas } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminQuotePage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageQuotas(member.roles)) {
    redirect("/admin/rimborsi");
  }

  let settings: Awaited<ReturnType<typeof listAnnualQuotaSettings>> = [];
  let members: Awaited<ReturnType<typeof listMembers>> = [];
  let existingQuotas: Awaited<ReturnType<typeof listMemberAnnualQuotas>> = [];

  try {
    [settings, members, existingQuotas] = await Promise.all([
      listAnnualQuotaSettings(supabase),
      listMembers(supabase),
      listMemberAnnualQuotas(supabase),
    ]);
  } catch {
    settings = [];
    members = [];
    existingQuotas = [];
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Quote annuali
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Imposta gli importi per anno e registra i pagamenti degli associati.
        </p>
      </div>

      <QuotasPanel
        settings={settings}
        members={members}
        existingQuotas={existingQuotas}
      />
    </div>
  );
}
