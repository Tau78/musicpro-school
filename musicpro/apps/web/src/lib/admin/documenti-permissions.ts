import { cache } from "react";

import { listAppSettings } from "@musicpro/database";

import {
  type DocumentiSegreteriaFlags,
  type DocumentiSubsection,
} from "@/lib/admin/documenti-permissions-core";
import { createClient } from "@/lib/supabase/server";

export type {
  DocumentiSegreteriaFlags,
  DocumentiSubsection,
} from "@/lib/admin/documenti-permissions-core";
export {
  canAccessDocumentiRicevute,
  canAccessDocumentiSubsection,
  canManageDocumentiPermissions,
  hasAnyDocumentiSubsection,
} from "@/lib/admin/documenti-permissions-core";

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

/** Una lettura impostazioni documenti per richiesta (layout + pagine). Server-only. */
export const getDocumentiSegreteriaFlags = cache(
  async (): Promise<DocumentiSegreteriaFlags> => {
    try {
      const supabase = await createClient();
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
    } catch {
      // Docenti e altri ruoli senza SELECT su app_settings non devono far crashare la shell.
      return { ...DEFAULT_FLAGS };
    }
  },
);
