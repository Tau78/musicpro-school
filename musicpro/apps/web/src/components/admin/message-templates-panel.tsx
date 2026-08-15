"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createMessageTemplate,
  deleteMessageTemplate,
  updateMessageTemplate,
  type MessageTemplate,
  type MessageTemplateChannel,
  type MessageTemplateInput,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface MessageTemplatesPanelProps {
  templates: MessageTemplate[];
  createdBy?: string | null;
}

const CHANNEL_LABELS: Record<MessageTemplateChannel, string> = {
  email: "Email",
  telegram: "Telegram",
  sms: "SMS",
};

function emptyForm(): MessageTemplateInput {
  return {
    name: "",
    subject: "",
    body: "",
    channel: "email",
  };
}

function templateToInput(template: MessageTemplate): MessageTemplateInput {
  return {
    name: template.name,
    subject: template.subject,
    body: template.body,
    channel: template.channel,
  };
}

export function MessageTemplatesPanel({
  templates,
  createdBy,
}: MessageTemplatesPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MessageTemplateInput>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function updateField<K extends keyof MessageTemplateInput>(
    key: K,
    value: MessageTemplateInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(template: MessageTemplate) {
    setEditingId(template.id);
    setForm(templateToInput(template));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: MessageTemplateInput = {
      ...form,
      createdBy: createdBy ?? null,
    };

    const result = editingId
      ? await updateMessageTemplate(supabase, editingId, payload)
      : await createMessageTemplate(supabase, payload);

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Errore durante il salvataggio.");
      return;
    }

    setSuccess(editingId ? "Modello aggiornato." : "Modello creato.");
    setEditingId(null);
    setForm(emptyForm());
    router.refresh();
  }

  async function handleDelete(templateId: string) {
    if (!window.confirm("Eliminare questo modello?")) return;

    setDeletingId(templateId);
    setError(null);
    setSuccess(null);

    const result = await deleteMessageTemplate(supabase, templateId);
    setDeletingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il modello.");
      return;
    }

    if (editingId === templateId) {
      cancelEdit();
    }

    setSuccess("Modello eliminato.");
    router.refresh();
  }

  return (
    <div className="space-y-8">
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

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Nome
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Oggetto
              </th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">
                Canale
              </th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {templates.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-neutral-500"
                >
                  Nessun modello salvato.
                </td>
              </tr>
            ) : (
              templates.map((template) => (
                <tr key={template.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {template.name}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-neutral-600">
                    {template.subject}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {CHANNEL_LABELS[template.channel]}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      className="mr-2 text-sm font-medium text-[var(--brand)] hover:underline"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {deletingId === template.id ? "…" : "Elimina"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5"
      >
        <h3 className="text-lg font-semibold text-neutral-900">
          {editingId ? "Modifica modello" : "Nuovo modello"}
        </h3>
        <p className="text-sm text-neutral-500">
          Segnaposto disponibili:{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{nome}}"}</code>,{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{cognome}}"}</code>,{" "}
          <code className="rounded bg-neutral-100 px-1">{"{{numero}}"}</code>
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Nome modello
            </span>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Canale
            </span>
            <select
              value={form.channel ?? "email"}
              onChange={(e) =>
                updateField(
                  "channel",
                  e.target.value as MessageTemplateChannel,
                )
              }
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              <option value="email">Email</option>
              <option value="telegram">Telegram</option>
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            Oggetto
          </span>
          <input
            type="text"
            required
            value={form.subject}
            onChange={(e) => updateField("subject", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">
            Testo messaggio
          </span>
          <textarea
            required
            rows={8}
            value={form.body}
            onChange={(e) => updateField("body", e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving
              ? "Salvataggio…"
              : editingId
                ? "Salva modifiche"
                : "Crea modello"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Annulla
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
