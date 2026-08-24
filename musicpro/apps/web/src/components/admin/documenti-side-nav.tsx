"use client";

import { usePathname } from "next/navigation";

import { AdminFlatNav } from "@/components/admin/admin-side-nav";
import { DOCUMENTI_SUBSECTION_HREFS } from "@/lib/admin/documenti-nav";

interface DocumentiSideNavProps {
  showAssociati: boolean;
  showVerbali: boolean;
  showCespiti: boolean;
  showPermessi: boolean;
}

export function DocumentiSideNav({
  showAssociati,
  showVerbali,
  showCespiti,
  showPermessi,
}: DocumentiSideNavProps) {
  const pathname = usePathname();

  const items = [
    {
      href: DOCUMENTI_SUBSECTION_HREFS.associati,
      label: "Libro Associati",
      active: pathname.startsWith(DOCUMENTI_SUBSECTION_HREFS.associati),
      visible: showAssociati,
    },
    {
      href: DOCUMENTI_SUBSECTION_HREFS.verbali,
      label: "Verbali",
      active: pathname.startsWith(DOCUMENTI_SUBSECTION_HREFS.verbali),
      visible: showVerbali,
    },
    {
      href: DOCUMENTI_SUBSECTION_HREFS.cespiti,
      label: "Libro Cespiti",
      active: pathname.startsWith(DOCUMENTI_SUBSECTION_HREFS.cespiti),
      visible: showCespiti,
    },
    {
      href: DOCUMENTI_SUBSECTION_HREFS.permessi,
      label: "Permessi",
      active: pathname.startsWith(DOCUMENTI_SUBSECTION_HREFS.permessi),
      visible: showPermessi,
    },
  ].filter((item) => item.visible);

  if (items.length === 0) {
    return null;
  }

  return (
    <AdminFlatNav
      items={items.map(({ href, label, active }) => ({ href, label, active }))}
      label="Documenti"
    />
  );
}
