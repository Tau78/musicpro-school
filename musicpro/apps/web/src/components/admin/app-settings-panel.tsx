"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DOCUMENT_SETTING_LABELS,
  type AppSetting,
  type DocumentSettingKey,
  upsertDocumentSettings,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface AppSettingsPanelProps {
  settings: AppSetting[];
}

export function AppSettingsPanel({ settings }: AppSettingsPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const result = await upsertDocumentSettings(supabase, form);
    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess("Impostazioni documenti aggiornate.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Drive, template e storage
        </legend>
        <p className="text-sm text-neutral-600">
          Chiavi legacy migrate da GAS (`app_settings`). Gli ID Drive restano
          utili come riferimento per PDF storici; i bucket Storage servono per
          i nuovi documenti.
        </p>
        <div className="grid gap-4">
          {settings.map((setting) => {
            const key = setting.key as DocumentSettingKey;
            const label =
              DOCUMENT_SETTING_LABELS[key] ?? setting.description ?? setting.key;
            return (
              <label key={setting.key} className="block text-sm">
                <span className="mb-1 block text-neutral-600">{label}</span>
                <input
                  type="text"
                  value={form[setting.key] ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      [setting.key]: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
                  spellCheck={false}
                />
                <span className="mt-1 block text-xs text-neutral-400">
                  chiave: {setting.key}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : "Salva impostazioni documenti"}
        </button>
      </div>
    </form>
  );
}
