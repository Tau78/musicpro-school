import { Suspense } from "react";
import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { DocumentiWorkspaceNav } from "@/components/admin/documenti-workspace-nav";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiRicevute,
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
export default async function DocumentiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getAdminMember();

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin/documenti");
  }

  const flags = await getDocumentiSegreteriaFlags();
  const showAssociati = canAccessDocumentiSubsection(
    member.roles,
    "libro_associati",
    flags,
  );
  const showVerbali = canAccessDocumentiSubsection(
    member.roles,
    "verbali",
    flags,
  );
  const showCespiti = canAccessDocumentiSubsection(
    member.roles,
    "libro_cespiti",
    flags,
  );
  const showPermessi = canManageDocumentiPermissions(member.roles);
  const showRicevute = canAccessDocumentiRicevute(member.roles);

  const isAdmin = member.roles.includes(MemberRole.Admin);
  const hasSubsection =
    showAssociati || showRicevute || showVerbali || showCespiti || showPermessi;

  if (!isAdmin && !hasSubsection) {
    redirect("/dashboard?error=unauthorized");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <Suspense fallback={null}>
        <DocumentiWorkspaceNav
          showAssociati={showAssociati}
          showRicevute={showRicevute}
          showVerbali={showVerbali}
          showCespiti={showCespiti}
          showPermessi={showPermessi}
        />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
