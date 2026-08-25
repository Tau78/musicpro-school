"use client";

import { useRouter } from "next/navigation";

import { SettingsSectionTabs } from "@/components/admin/settings-page-chrome";

export function ShopSettingsTabs({
  section,
}: {
  section: "pacchetti" | "storico";
}) {
  const router = useRouter();

  return (
    <div className="mb-6">
      <SettingsSectionTabs
        tabs={[
          { id: "pacchetti", label: "Pacchetti" },
          { id: "storico", label: "Storico acquisti" },
        ]}
        value={section}
        onChange={(next) => {
          router.push(
            next === "storico" ? "/admin/shop?sezione=storico" : "/admin/shop",
          );
        }}
      />
    </div>
  );
}
