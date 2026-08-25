"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  DOCUMENT_SETTING_LABELS,
  type AppSetting,
  type DocumentSettingKey,
  upsertDocumentSettings,
} from "@musicpro/database";

import {
  FieldLabel,
  SettingsTabs,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

interface AppSettingsPanelProps {
  settings: AppSetting[];
  keys?: readonly string[];
  title?: string;
  description?: string;
  submitLabel?: string;
  extraTabs?: { id: string; label: string; content: React.ReactNode }[];
}

const HUMAN_SETTING_LABELS: Record<string, string> = {
  root_reimbursements_folder_id: "Cartella notule",
  reimbursement_template_id: "Modello notule",
  enrollment_template_id: "Modello iscrizione",
  root_enrollments_folder_id: "Cartella iscrizioni",
  admin_email: "Email admin",
  segreteria_email: "Email segreteria",
  storage_bucket_reimbursements: "Archivio notule",
  storage_bucket_enrollments: "Archivio iscrizioni",
  legacy_spreadsheet_id: "Foglio storico",
  timezone: "Fuso orario",
};

function settingLabel(setting: AppSetting): string {
  const key = setting.key as DocumentSettingKey;
  return (
    HUMAN_SETTING_LABELS[setting.key] ??
    DOCUMENT_SETTING_LABELS[key] ??
    setting.description ??
    setting.key
  );
}

export function TemplateSettingsLayout({
  templatesPanel,
  settingsPanel,
}: {
  templatesPanel?: React.ReactNode;
  settingsPanel?: React.ReactNode;
}) {
  const hasBoth = Boolean(templatesPanel && settingsPanel);
  const [tab, setTab] = useState<"modelli" | "documenti">("modelli");
  const active = hasBoth
    ? tab
    : templatesPanel
      ? "modelli"
      : "documenti";

  return (
    <div className="space-y-6">
      {hasBoth ? (
        <SettingsTabs
          tabs={[
            { id: "modelli", label: "Modelli" },
            { id: "documenti", label: "Documenti" },
          ]}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {active === "modelli" ? templatesPanel : null}
      {active === "documenti" ? settingsPanel : null}
    </div>
  );
}

export function AppSettingsPanel({
  settings,
  keys,
  title,
  description,
  submitLabel = "Salva",
  extraTabs,
}: AppSettingsPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(settings.map((s) => [s.key, s.value])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tab, setTab] = useState("impostazioni");

  const visibleSettings = keys
    ? settings.filter((setting) => keys.includes(setting.key))
    : settings;

  const tabs = extraTabs
    ? [
        { id: "impostazioni", label: title ?? "Impostazioni" },
        ...extraTabs.map((item) => ({ id: item.id, label: item.label })),
      ]
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload = keys
      ? Object.fromEntries(
          Object.entries(form).filter(([key]) => keys.includes(key)),
        )
      : form;
    const result = await upsertDocumentSettings(supabase, payload);
    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess("Impostazioni documenti aggiornate.");
    router.refresh();
  }

  const fields = (
    <div className="grid gap-4">
      {visibleSettings.map((setting) => (
        <label key={setting.key} className="block">
          <FieldLabel>{settingLabel(setting)}</FieldLabel>
          <input
            type="text"
            name={setting.key}
            value={form[setting.key] ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                [setting.key]: e.target.value,
              }))
            }
            className={settingsInputClass}
            spellCheck={false}
          />
        </label>
      ))}
    </div>
  );

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

      {tabs ? (
        <SettingsTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
        />
      ) : title ? (
        <div>
          <h3 className="text-lg font-semibold text-[var(--brand)]">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-neutral-600">{description}</p>
          ) : null}
        </div>
      ) : null}

      {tabs && tab !== "impostazioni" ? (
        extraTabs?.find((item) => item.id === tab)?.content
      ) : (
        fields
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {saving ? "Salvataggio…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
