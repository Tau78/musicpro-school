"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createRoomExternalCalendar,
  deleteRoomExternalCalendar,
  formatDateItalian,
  listRoomExternalCalendars,
  requestExternalCalendarSync,
  todayInRome,
  updateRoomExternalCalendar,
  type RoomExternalCalendar,
  type RoomExternalCalendarInput,
} from "@musicpro/database";

import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { createClient } from "@/lib/supabase/client";

interface RoomExternalCalendarsPanelProps {
  roomId: string;
}

function emptyInput(): RoomExternalCalendarInput {
  return {
    name: "",
    googleCalendarId: "",
    enabled: true,
  };
}

function calendarToInput(
  calendar: RoomExternalCalendar,
): RoomExternalCalendarInput {
  return {
    name: calendar.name,
    googleCalendarId: calendar.googleCalendarId,
    enabled: calendar.enabled,
  };
}

function formatSyncStatus(calendar: RoomExternalCalendar): string {
  if (calendar.lastSyncError) {
    return `Errore: ${calendar.lastSyncError}`;
  }
  if (calendar.lastSyncedAt) {
    const date = new Date(calendar.lastSyncedAt);
    return `Ultima sync: ${date.toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return "Mai sincronizzato";
}

export function RoomExternalCalendarsPanel({
  roomId,
}: RoomExternalCalendarsPanelProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [calendars, setCalendars] = useState<RoomExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomExternalCalendarInput>(emptyInput());
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listRoomExternalCalendars(supabase, roomId);
      setCalendars(list);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossibile caricare i calendari esterni.",
      );
    } finally {
      setLoading(false);
    }
  }, [roomId, supabase]);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  function updateField<K extends keyof RoomExternalCalendarInput>(
    key: K,
    value: RoomExternalCalendarInput[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(calendar: RoomExternalCalendar) {
    setEditingId(calendar.id);
    setForm(calendarToInput(calendar));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyInput());
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const wasCreate = !editingId;
    const result = editingId
      ? await updateRoomExternalCalendar(supabase, editingId, form)
      : await createRoomExternalCalendar(supabase, roomId, form);

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Operazione non riuscita.");
      return;
    }

    setEditingId(null);
    setForm(emptyInput());
    await loadCalendars();
    router.refresh();

    if (wasCreate && result.id) {
      await handleSync(result.id, "Calendario aggiunto e sincronizzato.");
      return;
    }

    setSuccess(wasCreate ? "Calendario aggiunto." : "Calendario aggiornato.");
  }

  async function handleDelete(calendarId: string) {
    const ok = window.confirm("Eliminare questo calendario esterno?");
    if (!ok) return;

    setDeletingId(calendarId);
    setError(null);
    setSuccess(null);

    const result = await deleteRoomExternalCalendar(supabase, calendarId);
    setDeletingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Eliminazione non riuscita.");
      return;
    }

    if (editingId === calendarId) cancelEdit();
    setSuccess("Calendario eliminato.");
    await loadCalendars();
    router.refresh();
  }

  async function handleSync(calendarId: string, successMessage?: string) {
    setSyncingId(calendarId);
    setError(null);
    setSuccess(null);

    try {
      const result = await requestExternalCalendarSync({
        roomId,
        calendarId,
      });

      if (!result.success) {
        setError(result.message ?? "Sincronizzazione non riuscita.");
        return;
      }

      setSuccess(successMessage ?? result.message ?? "Calendario sincronizzato.");
      await loadCalendars();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sincronizzazione non riuscita.",
      );
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <CollapsibleSection
        title="Calendari esterni"
        description={`Importa calendari Google pubblici per bloccare slot occupati. Oggi: ${formatDateItalian(todayInRome())}.`}
      >
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {success}
        </p>
      )}

      {loading && (
        <p className="text-sm text-neutral-500">Caricamento calendari…</p>
      )}

      {!loading && calendars.length > 0 && (
        <ul className="space-y-3">
          {calendars.map((calendar) => (
            <li
              key={calendar.id}
              className="rounded-xl border border-neutral-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-neutral-900">{calendar.name}</p>
                  <p className="mt-1 font-mono text-xs text-neutral-500">
                    {calendar.googleCalendarId}
                  </p>
                  <p
                    className={`mt-2 text-xs ${
                      calendar.lastSyncError
                        ? "text-red-700"
                        : "text-neutral-500"
                    }`}
                  >
                    {formatSyncStatus(calendar)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    calendar.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {calendar.enabled ? "Attivo" : "Disattivo"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(calendar)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Modifica
                </button>
                <button
                  type="button"
                  disabled={syncingId !== null}
                  onClick={() => void handleSync(calendar.id)}
                  className="rounded-lg border border-[var(--brand)] px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-60"
                >
                  {syncingId === calendar.id ? "Sync…" : "Sincronizza"}
                </button>
                <button
                  type="button"
                  disabled={deletingId === calendar.id}
                  onClick={() => void handleDelete(calendar.id)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === calendar.id ? "…" : "Elimina"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && calendars.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
          Nessun calendario esterno configurato per questa sala.
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 border-t border-neutral-100 pt-6">
        <h4 className="text-sm font-medium text-neutral-800">
          {editingId ? "Modifica calendario" : "Aggiungi calendario"}
        </h4>

        <div>
          <label htmlFor="cal-name" className="block text-sm font-medium text-neutral-700">
            Nome
          </label>
          <input
            id="cal-name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="es. Aula Arancio — Scuola"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="cal-google-id"
            className="block text-sm font-medium text-neutral-700"
          >
            ID Google Calendar
          </label>
          <input
            id="cal-google-id"
            type="text"
            value={form.googleCalendarId}
            onChange={(e) => updateField("googleCalendarId", e.target.value)}
            placeholder="xxxx@group.calendar.google.com"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => updateField("enabled", e.target.checked)}
            className="rounded border-neutral-300"
          />
          Calendario attivo
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {saving ? "Salvataggio…" : editingId ? "Aggiorna" : "Aggiungi"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Annulla
            </button>
          )}
        </div>
      </form>
      </CollapsibleSection>
    </div>
  );
}
