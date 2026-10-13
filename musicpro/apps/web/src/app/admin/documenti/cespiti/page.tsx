import Link from "next/link";
import { redirect } from "next/navigation";

import {
  formatEuro,
  listAssetsOnSale,
  listFixedAssets,
  listSaleLedger,
  romeCalendarYear,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CespitiPanel } from "@/components/admin/cespiti/cespiti-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageSchoolMarket } from "@/lib/admin/roles";
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
  const flags = await getDocumentiSegreteriaFlags();

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

  const canSell = canManageSchoolMarket(member.roles);
  const [assets, onSale, ledger] = await Promise.all([
    listFixedAssets(supabase),
    listAssetsOnSale(supabase).catch(() => [] as string[]),
    canSell ? listSaleLedger(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  const selling = new Set(onSale);
  const initialAssets = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      photoUrl: await signedPhotoUrl(supabase, asset.photoStoragePath),
      onSale: selling.has(asset.id),
    })),
  );
  const salesTotal = ledger.reduce((sum, entry) => sum + entry.amountCents, 0);
  const salesYear = romeCalendarYear();

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
          {canSell ? (
            <>
              {" "}
              <Link href="/admin/market" className="font-medium text-[var(--brand)]">
                Entrate vendite {salesYear}: {formatEuro(salesTotal / 100)}
              </Link>
              .
            </>
          ) : null}
        </p>
      </div>

      <CespitiPanel
        initialAssets={initialAssets}
        isAdmin={isAdmin}
        canSell={canSell}
        memberId={member.id}
      />
    </div>
  );
}
