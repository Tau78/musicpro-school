import { AdminPillNav } from "./admin-pill-nav";

type PrenotazioniSettingsSection = "soglie" | "penali" | "crediti";

export function PrenotazioniSettingsNav({
  section,
}: {
  section: PrenotazioniSettingsSection;
}) {
  return (
    <AdminPillNav
      nested
      items={[
        {
          href: "/admin/impostazioni",
          label: "Soglie",
          active: section === "soglie",
        },
        {
          href: "/admin/impostazioni?sezione=penali",
          label: "Penali",
          active: section === "penali",
        },
        {
          href: "/admin/impostazioni?sezione=crediti",
          label: "Crediti",
          active: section === "crediti",
        },
      ]}
    />
  );
}
