"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createPublicBoard,
  deletePublicBoard,
  layoutLabel,
  savePublicDisplaySettings,
  type BoardKind,
  type PublicBoard,
  type PublicDisplaySettings,
} from "@musicpro/database";

import { settingsInputClass } from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

export function BoardsAdmin({
  settings,
  boards,
  roomNames,
}: {
  settings: PublicDisplaySettings;
  boards: PublicBoard[];
  roomNames: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [siteLabel, setSiteLabel] = useState(settings.siteLabel);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function saveSettings() {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await savePublicDisplaySettings(supabase, {
      enabled,
      siteLabel,
    });
    setPending(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }
    setMessage("Impostazioni salvate.");
    router.refresh();
  }

  async function add(kind: BoardKind) {
    setError(null);
    const result = await createPublicBoard(supabase, { kind });
    if (!result.success || !result.id) {
      setError(result.errorMessage ?? "Impossibile creare il tabellone.");
      return;
    }
    router.push(`/admin/lezioni/tabelloni/${result.id}`);
  }

  async function remove(board: PublicBoard) {
    if (!window.confirm(`Eliminare «${board.name}»?`)) return;
    const result = await deletePublicBoard(supabase, board.id);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il tabellone.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-lg font-semibold text-neutral-900">Tabelloni</h1>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Attiva
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Sede</span>
          <input
            value={siteLabel}
            onChange={(event) => setSiteLabel(event.target.value)}
            className={`${settingsInputClass} w-36`}
            maxLength={40}
            aria-label="Sede"
          />
        </label>
        <button
          type="button"
          onClick={saveSettings}
          disabled={pending}
          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Salva
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => add("occupancy")}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800"
          >
            + Occupazione aule
          </button>
          <button
            type="button"
            onClick={() => add("timetable")}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white"
          >
            + Tabellone orari
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        Orario del giorno sulle Smart TV. Indirizzo{" "}
        <Link href="/tabellone" className="text-[var(--brand)]" target="_blank">
          /tabellone
        </Link>
        .
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-green-800">{message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Nome</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Layout</th>
              <th className="px-3 py-2 font-medium">Aula</th>
              <th className="px-3 py-2 font-medium">Righe</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => (
              <tr key={board.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-3 py-2 font-medium text-neutral-900">{board.name}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {board.kind === "occupancy" ? "Aule" : "Orari"}
                </td>
                <td className="px-3 py-2 text-neutral-600">{layoutLabel(board.layout)}</td>
                <td className="px-3 py-2 text-neutral-600">
                  {board.roomId ? (roomNames[board.roomId] ?? "Aula") : "Tutte"}
                </td>
                <td className="px-3 py-2 text-neutral-600">
                  {board.kind === "timetable" ? board.rowCount : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/tabellone/${board.id}`}
                    target="_blank"
                    className="mr-3 text-[var(--brand)]"
                  >
                    Apri
                  </Link>
                  <Link
                    href={`/admin/lezioni/tabelloni/${board.id}`}
                    className="mr-3 text-[var(--brand)]"
                  >
                    Modifica
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(board)}
                    className="text-red-700"
                  >
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
