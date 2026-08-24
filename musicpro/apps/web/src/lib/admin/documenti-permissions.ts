import { listAppSettings } from "@musicpro/database";
import { MemberRole, type MemberRoleValue } from "@musicpro/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

import { canManageSettings } from "@/lib/admin/roles";

export type DocumentiSubsection =
  | "libro_associati"
  | "verbali"
  | "libro_cespiti";

export type DocumentiSegreteriaFlags = Record<DocumentiSubsection, boolean>;

const FLAG_KEYS: Record<DocumentiSubsection, string> = {
  libro_associati: "documenti_segreteria_libro_associati",
  verbali: "documenti_segreteria_verbali",
  libro_cespiti: "documenti_segreteria_libro_cespiti",
};

const DEFAULT_FLAGS: DocumentiSegreteriaFlags = {
  libro_associati: true,
  verbali: false,
  libro_cespiti: true,
};

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export async function getDocumentiSegreteriaFlags(
  supabase: SupabaseClient,
): Promise<DocumentiSegreteriaFlags> {
  const settings = await listAppSettings(supabase, Object.values(FLAG_KEYS));
  const byKey = new Map(settings.map((s) => [s.key, s.value]));

  return {
    libro_associati: parseBool(
      byKey.get(FLAG_KEYS.libro_associati),
      DEFAULT_FLAGS.libro_associati,
    ),
    verbali: parseBool(byKey.get(FLAG_KEYS.verbali), DEFAULT_FLAGS.verbali),
    libro_cespiti: parseBool(
      byKey.get(FLAG_KEYS.libro_cespiti),
      DEFAULT_FLAGS.libro_cespiti,
    ),
  };
}

export function canAccessDocumentiSubsection(
  roles: MemberRoleValue[],
  subsection: DocumentiSubsection,
  flags: DocumentiSegreteriaFlags,
): boolean {
  if (roles.includes(MemberRole.Admin)) return true;
  if (!canManageSettings(roles)) return false;
  if (roles.includes(MemberRole.Segreteria)) return flags[subsection];
  return false;
}

export function canManageDocumentiPermissions(
  roles: MemberRoleValue[],
): boolean {
  return roles.includes(MemberRole.Admin);
}

export function hasAnyDocumentiSubsection(
  roles: MemberRoleValue[],
  flags: DocumentiSegreteriaFlags,
): boolean {
  if (roles.includes(MemberRole.Admin)) return true;
  if (!canManageSettings(roles)) return false;
  return flags.libro_associati || flags.verbali || flags.libro_cespiti;
}
