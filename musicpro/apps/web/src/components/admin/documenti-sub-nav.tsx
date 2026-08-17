"use client";

import { usePathname } from "next/navigation";

import { AdminPillNav } from "./admin-pill-nav";

export function DocumentiSubNav() {
  const pathname = usePathname();

  return (
    <AdminPillNav
      nested
      items={[
        {
          href: "/admin/impostazioni/documenti",
          label: "Documenti",
          active: pathname === "/admin/impostazioni/documenti",
        },
        {
          href: "/admin/impostazioni/documenti/drive",
          label: "Drive",
          active: pathname.startsWith("/admin/impostazioni/documenti/drive"),
        },
        {
          href: "/admin/impostazioni/documenti/template",
          label: "Template",
          active:
            pathname.startsWith("/admin/impostazioni/documenti/template") ||
            pathname.startsWith("/admin/template"),
        },
      ]}
    />
  );
}
