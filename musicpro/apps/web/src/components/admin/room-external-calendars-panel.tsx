"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createRoomExternalCalendar,
  deleteRoomExternalCalendar,
  listRoomExternalCalendars,
  requestExternalCalendarSync,
  updateRoomExternalCalendar,
  type RoomExternalCalendar,
  type RoomExternalCalendarInput,
} from "@musicpro/database";

import {
  FieldLabel,
  ToggleRow,
  settingsInputClass,
} from "@/components/admin/settings-chrome";
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

function calendarStatus(
  calendar: RoomExternalCalendar,
): "Attivo" | "Spento" | "Errore" {
  if (calendar.lastSyncError) return "Errore";
  return calendar.enabled ? "Attivo" : "Spento";
}

function formatSyncAt(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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
          : "Impossibile caricare i calendari.",
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
    const ok = window.confirm("Eliminare questo calendario?");
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
    <div className="space-y-4">
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
          {calendars.map((calendar) => {
            const status = calendarStatus(calendar);
            return (
              <li
                key={calendar.id}
                className="rounded-xl border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="font-medium text-neutral-900">{calendar.name}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      status === "Attivo"
                        ? "bg-green-100 text-green-800"
                        : status === "Errore"
                          ? "bg-red-100 text-red-800"
                          : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {status}
                  </span>
                </div>
                <p className="mt-1 break-all text-xs text-neutral-500">
                  {calendar.googleCalendarId}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {calendar.lastSyncedAt
                    ? `Ultima sync: ${formatSyncAt(calendar.lastSyncedAt)}`
                    : "Mai sincronizzato"}
                </p>
                {calendar.lastSyncError ? (
                  <p className="mt-1 text-xs text-red-700">
                    {calendar.lastSyncError}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={syncingId !== null}
                    onClick={() => void handleSync(calendar.id)}
                    className="rounded-lg border border-[var(--brand)] px-3 py-1.5 text-xs font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5 disabled:opacity-60"
                  >
                    {syncingId === calendar.id ? "Sincronizzo…" : "Sincronizza"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(calendar)}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Modifica
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
            );
          })}
        </ul>
      )}

      {!loading && calendars.length === 0 && (
        <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-600">
          Nessun calendario per questa sala.
        </p>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="space-y-4 border-t border-neutral-100 pt-6"
      >
        <p className="text-sm text-neutral-600">
          Gli eventi importati compaiono in Lezioni → Calendario, vista Sala,
          su questa stanza. Il calendario deve essere condiviso con il service
          account Google oppure pubblico (feed iCal).
        </p>

        <h4 className="text-sm font-medium text-neutral-800">
          {editingId ? "Modifica calendario" : "Aggiungi calendario"}
        </h4>

        <div>
          <label htmlFor="cal-name">
            <FieldLabel>Nome</FieldLabel>
          </label>
          <input
            id="cal-name"
            type="text"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="es. Aula Arancio — Scuola"
            className={settingsInputClass}
          />
        </div>

        <div>
          <label htmlFor="cal-google-id">
            <FieldLabel>Indirizzo calendario</FieldLabel>
          </label>
          <input
            id="cal-google-id"
            type="text"
            value={form.googleCalendarId}
            onChange={(e) => updateField("googleCalendarId", e.target.value)}
            placeholder="xxxx@group.calendar.google.com"
            className={settingsInputClass}
          />
        </div>

        <ToggleRow
          label="Attivo"
          checked={form.enabled}
          onChange={(checked) => updateField("enabled", checked)}
        />

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
    </div>
  );
}
