import { redirect } from "next/navigation";

import { getAdminMember } from "@/lib/admin/current-member";
import { DocumentiPermessiPanel } from "@/components/admin/documenti-permessi-panel";
import {
  canManageDocumentiPermissions,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import {
  buildDocumentiNavFlags,
  firstDocumentiHref,
} from "@/lib/admin/documenti-nav";

export default async function DocumentiPermessiPage() {
  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags();

  if (!member || !canManageDocumentiPermissions(member.roles)) {
    redirect(
      firstDocumentiHref(buildDocumentiNavFlags(member?.roles ?? [], flags)),
    );
  }

  return <DocumentiPermessiPanel initialFlags={flags} />;
}
