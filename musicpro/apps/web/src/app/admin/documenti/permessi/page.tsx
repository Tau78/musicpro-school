import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import { DocumentiPermessiPanel } from "@/components/admin/documenti-permessi-panel";
import {
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentiPermessiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags(supabase);

  if (!member || !canManageDocumentiPermissions(member.roles)) {
    redirect(
      firstDocumentiHref({
        showAssociati: canAccessDocumentiSubsection(
          member?.roles ?? [],
          "libro_associati",
          flags,
        ),
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

  return <DocumentiPermessiPanel initialFlags={flags} />;
}
