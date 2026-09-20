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
  initialSubject?: string;
  initialBody?: string;
  initialChannel?: MessageChannel;
  campaignName?: string;
}

export function BulkMessageModal({
  open,
  members,
  onClose,
  onSent,
  initialSubject = "",
  initialBody = "",
  initialChannel = "email",
  campaignName,
}: BulkMessageModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [channel, setChannel] = useState<MessageChannel>(initialChannel);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setSubject(initialSubject);
    setBody(initialBody);
    setChannel(initialChannel);
    setTemplateId("");
    setError(null);
    setResultMessage(null);

    let cancelled = false;

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
  }, [open, initialSubject, initialBody, initialChannel]);

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
      let pendingIds = members.map((m) => m.id);
      let campaignId: string | undefined;
      let sent = 0;
      let failed = 0;
      let skipped = 0;
      const warnings: string[] = [];

      while (pendingIds.length > 0) {
        setResultMessage(
          `Invio in corso… ${sent} inviati, ${pendingIds.length} in coda`,
        );
        const resp = await fetch("/api/admin/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            memberIds: pendingIds,
            campaignId,
            channel,
            subject,
            body,
            templateId: templateId || null,
            campaignName: campaignName || undefined,
          }),
        });

        const raw = await resp.text();
        let data: {
          success?: boolean;
          message?: string;
          sent?: number;
          failed?: number;
          skipped?: number;
          warnings?: string[];
          campaignId?: string;
          pendingMemberIds?: string[];
        } = {};
        try {
          data = raw ? (JSON.parse(raw) as typeof data) : {};
        } catch {
          setError(
            `Invio fallito (${resp.status}${resp.statusText ? ` ${resp.statusText}` : ""}).`,
          );
          setSending(false);
          return;
        }

        if (!resp.ok || !data.success) {
          const serverMessage = data.message?.trim();
          setError(
            serverMessage && !/^bad request$/i.test(serverMessage)
              ? serverMessage
              : "Invio non riuscito. Se stavi scrivendo a molti associati, riprova.",
          );
          setSending(false);
          return;
        }

        sent += data.sent ?? 0;
        failed += data.failed ?? 0;
        skipped += data.skipped ?? 0;
        if (data.warnings) warnings.push(...data.warnings);
        campaignId = data.campaignId ?? campaignId;
        const nextPending = data.pendingMemberIds ?? [];
        if (
          nextPending.length === pendingIds.length &&
          (data.sent ?? 0) === 0 &&
          (data.failed ?? 0) === 0 &&
          (data.skipped ?? 0) === 0
        ) {
          setError("Invio interrotto: nessun progresso su questo lotto.");
          setSending(false);
          return;
        }
        pendingIds = nextPending;
      }

      const warningText =
        warnings.length > 0 ? ` ${[...new Set(warnings)].join(" ")}` : "";
      setResultMessage(
        `Invio completato. Inviati: ${sent}, falliti: ${failed}, saltati: ${skipped}.${warningText}`,
      );
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
