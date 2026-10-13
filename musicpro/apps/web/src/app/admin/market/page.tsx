import { redirect } from "next/navigation";

import {
  getMarketPaymentSettings,
  listMarketListings,
  listMarketOrders,
  listSaleLedger,
  romeCalendarYear,
} from "@musicpro/database";

import { MarketPanel } from "@/components/admin/market-panel";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canManageSchoolMarket,
  isSchoolMarketDeskOnly,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminMarketPage() {
  const member = await getAdminMember();
  if (!member || !canManageSchoolMarket(member.roles)) {
    redirect("/admin/associati");
  }

  const schoolOnly = isSchoolMarketDeskOnly(member.roles);
  const supabase = await createClient();
  const year = romeCalendarYear();
  const [listings, orders, settings, ledger] = await Promise.all([
    listMarketListings(supabase),
    listMarketOrders(supabase),
    schoolOnly
      ? Promise.resolve({ iban: "", holder: "" })
      : getMarketPaymentSettings(supabase),
    schoolOnly ? Promise.resolve([]) : listSaleLedger(supabase, year),
  ]);
  const schoolListings = schoolOnly
    ? listings.filter((item) => item.sellerKind === "associazione")
    : listings;
  const schoolIds = new Set(schoolListings.map((item) => item.id));
  const visibleOrders = schoolOnly
    ? orders.filter((order) => schoolIds.has(order.listingId))
    : orders;

  return (
    <div>
      <SettingsPageHeader
        title={schoolOnly ? "Market scuola" : "Market"}
        description={
          schoolOnly
            ? "Oggetti dell'associazione. I tuoi annunci personali restano nel Market della dashboard."
            : "Annunci dell'associazione e approvazione di quelli degli associati. Il libro cespiti è solo una scorciatoia."
        }
      />
      <MarketPanel
        listings={schoolListings}
        orders={visibleOrders}
        settings={settings}
        ledger={ledger}
        ledgerYear={year}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
        schoolOnly={schoolOnly}
      />
    </div>
  );
}
