import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin/documenti");
  }

  const flags = await getDocumentiSegreteriaFlags(supabase);

  redirect(
    firstDocumentiHref({
      showAssociati: canAccessDocumentiSubsection(
        member.roles,
        "libro_associati",
        flags,
      ),
      showVerbali: canAccessDocumentiSubsection(
        member.roles,
        "verbali",
        flags,
      ),
      showCespiti: canAccessDocumentiSubsection(
        member.roles,
        "libro_cespiti",
        flags,
      ),
      showPermessi: canManageDocumentiPermissions(member.roles),
    }),
  );
}
