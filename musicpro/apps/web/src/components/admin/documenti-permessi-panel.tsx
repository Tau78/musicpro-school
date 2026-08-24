"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { upsertAppSetting } from "@musicpro/database";

import { ToggleRow } from "@/components/admin/settings-chrome";
import type { DocumentiSegreteriaFlags } from "@/lib/admin/documenti-permissions";
import { createClient } from "@/lib/supabase/client";

const FLAG_CONFIG: {
  key: keyof DocumentiSegreteriaFlags;
  settingKey: string;
  label: string;
  description: string;
}[] = [
  {
    key: "libro_associati",
    settingKey: "documenti_segreteria_libro_associati",
    label: "Libro Associati",
    description: "Consente alla segreteria di generare il registro associati.",
  },
  {
    key: "verbali",
    settingKey: "documenti_segreteria_verbali",
    label: "Verbali",
    description:
      "Consente alla segreteria di accedere a scadenziario e casellario verbali.",
  },
  {
    key: "libro_cespiti",
    settingKey: "documenti_segreteria_libro_cespiti",
    label: "Libro Cespiti",
    description: "Consente alla segreteria di gestire il registro cespiti.",
  },
];

interface DocumentiPermessiPanelProps {
  initialFlags: DocumentiSegreteriaFlags;
}

export function DocumentiPermessiPanel({
  initialFlags,
}: DocumentiPermessiPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [flags, setFlags] = useState(initialFlags);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    for (const item of FLAG_CONFIG) {
      const result = await upsertAppSetting(
        supabase,
        item.settingKey,
        flags[item.key] ? "true" : "false",
        `Permesso segreteria: ${item.label}`,
      );

      if (!result.success) {
        setSaving(false);
        setError(result.errorMessage ?? "Impossibile salvare i permessi.");
        return;
      }
    }

    setSaving(false);
    setSuccess("Permessi segreteria aggiornati.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Permessi</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Scegli quali sezioni Documenti sono visibili agli utenti con ruolo
          segreteria.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <div className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {FLAG_CONFIG.map((item) => (
          <div key={item.key} className="px-4 py-4">
            <ToggleRow
              label={item.label}
              checked={flags[item.key]}
              onChange={(checked) =>
                setFlags((current) => ({ ...current, [item.key]: checked }))
              }
            />
            <p className="mt-1 text-xs text-neutral-500">{item.description}</p>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {saving ? "Salvataggio…" : "Salva permessi"}
      </button>
    </form>
  );
}
