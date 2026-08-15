"use client";

import { useEffect, useState } from "react";

import {
  listMessageTemplates,
  type MemberSummary,
  type MessageChannel,
  type MessageTemplate,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface BulkMessageModalProps {
  open: boolean;
  members: MemberSummary[];
  onClose: () => void;
  onSent?: () => void;
}

export function BulkMessageModal({
  open,
  members,
  onClose,
  onSent,
}: BulkMessageModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setResultMessage(null);

    void (async () => {
      try {
        const rows = await listMessageTemplates(createClient());
        if (!cancelled) setTemplates(rows);
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Impossibile caricare i modelli.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.body);
    if (template.channel === "email" || template.channel === "telegram") {
      setChannel(template.channel);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setResultMessage(null);

    try {
      const resp = await fetch("/api/admin/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          memberIds: members.map((m) => m.id),
          channel,
          subject,
          body,
          templateId: templateId || null,
        }),
      });

      const data = (await resp.json()) as {
        success?: boolean;
        message?: string;
        sent?: number;
        failed?: number;
        skipped?: number;
        warnings?: string[];
      };

      if (!resp.ok || !data.success) {
        setError(data.message ?? "Invio fallito.");
        setSending(false);
        return;
      }

      const warningText =
        data.warnings && data.warnings.length > 0
          ? ` ${data.warnings.join(" ")}`
          : "";
      setResultMessage((data.message ?? "Invio completato.") + warningText);
      onSent?.();
    } catch {
      setError("Errore di rete durante l'invio.");
    }

    setSending(false);
  }

  const withEmail = members.filter((m) => m.email).length;
  const withTelegram = members.filter((m) => m.telegramChatId).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-message-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2
            id="bulk-message-title"
            className="text-lg font-semibold text-neutral-900"
          >
            Invia messaggio
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-500 hover:text-neutral-800"
          >
            Chiudi
          </button>
        </div>

        <form onSubmit={handleSend} className="space-y-4 px-5 py-4">
          <p className="text-sm text-neutral-600">
            Destinatari selezionati:{" "}
            <span className="font-medium text-neutral-900">
              {members.length}
            </span>
            {" · "}
            con email: {withEmail}
            {" · "}
            con Telegram: {withTelegram}
          </p>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {resultMessage ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {resultMessage}
            </p>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Modello (opzionale)
            </span>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            >
              <option value="">— Nessuno —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-sm">
            <legend className="mb-1 font-medium text-neutral-700">
              Canale
            </legend>
            <div className="flex gap-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="channel"
                  checked={channel === "email"}
                  onChange={() => setChannel("email")}
                />
                Email
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="channel"
                  checked={channel === "telegram"}
                  onChange={() => setChannel("telegram")}
                />
                Telegram
              </label>
            </div>
          </fieldset>

          {channel === "email" ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-neutral-700">
                Oggetto
              </span>
              <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-neutral-700">
              Messaggio
            </span>
            <textarea
              required
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ciao {{nome}}, …"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
            />
          </label>

          <p className="text-xs text-neutral-500">
            Segnaposto: {"{{nome}}"}, {"{{cognome}}"}, {"{{numero}}"}
          </p>

          <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={sending || members.length === 0}
              className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
            >
              {sending ? "Invio…" : "Invia"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
