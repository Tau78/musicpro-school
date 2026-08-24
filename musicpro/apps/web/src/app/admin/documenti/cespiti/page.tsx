import { redirect } from "next/navigation";

import { listFixedAssets } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CespitiPanel } from "@/components/admin/cespiti/cespiti-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canAccessDocumentiSubsection,
  getDocumentiSegreteriaFlags,
} from "@/lib/admin/documenti-permissions";
import { firstDocumentiHref } from "@/lib/admin/documenti-nav";
import { signedPhotoUrl } from "@/lib/admin/cespiti-auth";
import { createClient } from "@/lib/supabase/server";

export default async function DocumentiLibroCespitiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();
  const flags = await getDocumentiSegreteriaFlags(supabase);

  if (
    !member ||
    !canAccessDocumentiSubsection(member.roles, "libro_cespiti", flags)
  ) {
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
        showCespiti: false,
        showPermessi: false,
      }),
    );
  }

  const assets = await listFixedAssets(supabase);
  const initialAssets = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      photoUrl: await signedPhotoUrl(supabase, asset.photoStoragePath),
    })),
  );

  const isAdmin = member.roles.includes(MemberRole.Admin);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Libro cespiti
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Registro beni e cespiti associativi: inventario per sala, foto e
          storico eventi.
        </p>
      </div>

      <CespitiPanel
        initialAssets={initialAssets}
        isAdmin={isAdmin}
        memberId={member.id}
      />
    </div>
  );
}
