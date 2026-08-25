"use client";

import { useState } from "react";

import type { WebsiteLink } from "@musicpro/database";

import { FieldLabel, settingsInputClass } from "@/components/admin/settings-chrome";

export function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      {multiline ? (
        <textarea
          className={`${settingsInputClass} min-h-24`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className={settingsInputClass}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function LinkFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WebsiteLink;
  onChange: (value: WebsiteLink) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        label={`${label} — testo`}
        value={value.label}
        onChange={(labelValue) => onChange({ ...value, label: labelValue })}
      />
      <Field
        label={`${label} — link`}
        value={value.href}
        onChange={(href) => onChange({ ...value, href })}
      />
    </div>
  );
}

export function LinesField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <Field
      label={`${label} (una riga ciascuno)`}
      value={value.join("\n")}
      multiline
      onChange={(text) => onChange(text.split("\n"))}
    />
  );
}

export function ImageField({
  label,
  value,
  alt,
  onChange,
  onAltChange,
}: {
  label: string;
  value: string;
  alt?: string;
  onChange: (url: string) => void;
  onAltChange?: (alt: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      if (alt) body.set("alt", alt);
      const response = await fetch("/api/admin/website/media", { method: "POST", body });
      const data = (await response.json()) as { ok?: boolean; url?: string; message?: string };
      if (!response.ok || !data.ok || !data.url) {
        throw new Error(data.message || "Caricamento non riuscito.");
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Field label={`${label} — URL`} value={value} onChange={onChange} />
      {onAltChange ? (
        <Field label={`${label} — didascalia`} value={alt ?? ""} onChange={onAltChange} />
      ) : null}
      <label className="block">
        <FieldLabel>Carica foto (jpeg, png, webp, gif · max 4 MB)</FieldLabel>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          disabled={uploading}
          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-200"
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {uploading ? <p className="text-sm text-neutral-600">Carico…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {value ? (
        <img src={value} alt={alt || ""} className="max-h-32 rounded-lg border border-neutral-200 object-cover" />
      ) : null}
    </div>
  );
}
