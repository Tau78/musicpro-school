import { redirect } from "next/navigation";

import { FiscalReceiptsPanel } from "@/components/admin/fiscal-receipts-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiRicevute,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import {
  buildDocumentiNavFlags,
  firstDocumentiHref,
} from "@/lib/admin/documenti-nav";

export default async function DocumentiRicevutePage() {
  const member = await getAdminMember();
  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin/documenti/ricevute");
  }

  const flags = await getDocumentiSegreteriaFlags();
  const nav = buildDocumentiNavFlags(member.roles, flags);

  if (!canAccessDocumentiRicevute(member.roles)) {
    redirect(firstDocumentiHref(nav));
  }

  return <FiscalReceiptsPanel actorMemberId={member.id} />;
}
