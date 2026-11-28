import { getCurrentMemberWithRoles } from "@musicpro/database";

import { RoleUiSwitch } from "@/components/dashboard/role-ui-switch";
import { uiSwitchOptions } from "@/lib/admin/ui-view";
import { getUiContext } from "@/lib/admin/ui-view.server";
import { createClient } from "@/lib/supabase/server";

/** Switch ruolo nelle pagine senza shell admin (associato, lezioni docente). */
export async function UiRoleSwitchSlot({
  tone,
  when = "any",
}: {
  tone: "onBrand" | "onLight";
  /** `associato`: niente doppione quando la shell admin è già in header. */
  when?: "any" | "associato";
}) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) return null;

  const ctx = await getUiContext(member.roles);
  if (!ctx.view) return null;
  if (when === "associato" && ctx.view !== "associato") return null;

  return (
    <RoleUiSwitch
      active={ctx.view}
      options={uiSwitchOptions(member.roles)}
      tone={tone}
    />
  );
}
