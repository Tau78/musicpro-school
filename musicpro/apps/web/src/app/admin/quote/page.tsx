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

interface PageProps {
  searchParams: Promise<{ sezione?: string }>;
}

export default async function AdminQuotePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();
  const { sezione } = await searchParams;

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
    <QuotasPanel
      settings={settings}
      members={members}
      existingQuotas={existingQuotas}
      initialTab={sezione === "pagamenti" ? "registrazione" : "impostazioni"}
    />
  );
}
