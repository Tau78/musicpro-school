import { redirect } from "next/navigation";

import {
  getMarketPaymentSettings,
  listMarketListings,
  listMarketOrders,
} from "@musicpro/database";

import { MarketPanel } from "@/components/admin/market-panel";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageShop } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminMarketPage() {
  const member = await getAdminMember();
  if (!member || !canManageShop(member.roles)) {
    redirect("/admin/associati");
  }

  const supabase = await createClient();
  const [listings, orders, settings] = await Promise.all([
    listMarketListings(supabase),
    listMarketOrders(supabase),
    getMarketPaymentSettings(supabase),
  ]);

  return (
    <div>
      <SettingsPageHeader
        title="Market"
        description="Strumenti e oggetti usati. In vendita sul sito, ritiro in sede."
      />
      <MarketPanel
        listings={listings}
        orders={orders}
        settings={settings}
        supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}
      />
    </div>
  );
}
