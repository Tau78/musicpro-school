import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles, listMarketListings } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { MarketBoard } from "@/components/associate/market-board";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { isSchoolMarketDeskOnly } from "@/lib/admin/roles";
import { listEventiUsedMarketListings } from "@/lib/market/eventi-used-catalog";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardMarketPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const [listings, profile, eventiDesk] = await Promise.all([
    listMarketListings(supabase),
    supabase.from("members").select("phone").eq("id", member.id).maybeSingle(),
    listEventiUsedMarketListings(),
  ]);

  const catalog = [
    ...eventiDesk,
    ...listings.filter((item) => item.status === "in_vendita"),
  ];
  const mine = listings.filter(
    (item) =>
      item.sellerKind === "associato" && item.sellerMemberId === member.id,
  );

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">{APP_NAME}</p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">Market</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/impostazioni"
              className="text-sm text-neutral-600 hover:text-[var(--brand)]"
            >
              Impostazioni
            </Link>
            <HeaderSettingsActions />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link href="/dashboard" className="text-sm font-medium text-[var(--brand)] hover:underline">
          ← Dashboard
        </Link>
        <p className="mt-4 text-sm text-neutral-600">
          Annunci in vendita e i tuoi. Un tuo annuncio compare solo dopo l&apos;approvazione della
          segreteria. Il pagamento di un oggetto tuo resta tra te e chi compra.
          {isSchoolMarketDeskOnly(member.roles) ? (
            <>
              {" "}
              Gli oggetti della scuola si gestiscono in{" "}
              <Link href="/admin/market" className="font-medium text-[var(--brand)] hover:underline">
                Market scuola
              </Link>
              .
            </>
          ) : null}
        </p>
        <div className="mt-6">
          <MarketBoard
            catalog={catalog}
            mine={mine}
            supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
            defaultPhone={profile.data?.phone ?? ""}
            defaultEmail={member.email ?? ""}
          />
        </div>
      </div>
    </main>
  );
}
