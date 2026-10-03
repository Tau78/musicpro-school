"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  BOARD_COLUMN_CATALOG,
  BOARD_LAYOUTS,
  deletePublicBoard,
  layoutLabel,
  sampleBoardCells,
  updatePublicBoard,
  type BoardColumn,
  type BoardColumnKey,
  type BoardLayout,
  type PublicBoard,
} from "@musicpro/database";

import { settingsInputClass } from "@/components/admin/settings-chrome";
import { createClient } from "@/lib/supabase/client";

function LayoutThumb({ layout }: { layout: BoardLayout }) {
  const swatch =
    layout === "giorno"
      ? "bg-[#1d4ed8]"
      : layout === "viola"
        ? "bg-[#6d28d9]"
        : layout === "notte"
          ? "bg-[#052e16]"
          : "bg-black";
  const bar =
    layout === "giorno"
      ? "bg-[#f5c400]"
      : layout === "viola"
        ? "bg-[#c4b5fd]"
        : layout === "notte"
          ? "bg-emerald-400"
          : "bg-amber-400";
  return (
    <span className={`flex h-16 w-28 flex-col overflow-hidden rounded border border-neutral-200 ${swatch}`}>
      <span className={`h-2 ${bar}`} />
      <span className="m-1 h-1.5 w-10 rounded-sm bg-white/70" />
      <span className="mx-1 h-1.5 w-16 rounded-sm bg-white/40" />
      <span className="mx-1 mt-1 h-1.5 w-14 rounded-sm bg-white/40" />
    </span>
  );
}

export function BoardEditor({
  board,
  rooms,
  siteLabel,
}: {
  board: PublicBoard;
  rooms: { id: string; name: string }[];
  siteLabel: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState(board.name);
  const [layout, setLayout] = useState<BoardLayout>(board.layout);
  const [roomId, setRoomId] = useState(board.roomId ?? "");
  const [showIndividuals, setShowIndividuals] = useState(board.showIndividuals);
  const [rowCount, setRowCount] = useState(String(board.rowCount));
  const [rowHeightPx, setRowHeightPx] = useState(String(board.rowHeightPx));
  const [hideBrand, setHideBrand] = useState(board.hideBrand);
  const [columns, setColumns] = useState<BoardColumn[]>(board.columns);
  const [addKey, setAddKey] = useState<BoardColumnKey>("note");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const preview = useMemo(
    () => sampleBoardCells(columns, siteLabel, showIndividuals),
    [columns, siteLabel, showIndividuals],
  );
  const timetable = board.kind === "timetable";

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= columns.length) return;
    const copy = [...columns];
    const [item] = copy.splice(index, 1);
    if (!item) return;
    copy.splice(next, 0, item);
    setColumns(copy);
  }

  function addColumn() {
    if (columns.length >= 12) return;
    const catalog = BOARD_COLUMN_CATALOG.find((item) => item.key === addKey);
    if (!catalog) return;
    setColumns([
      ...columns,
      {
        key: catalog.key,
        boardLabel: catalog.boardLabel,
        listLabel: catalog.listLabel,
      },
    ]);
  }

  async function save() {
    setPending(true);
    setError(null);
    setMessage(null);
    const result = await updatePublicBoard(supabase, board.id, {
      name,
      layout,
      roomId: roomId || null,
      showIndividuals,
      rowCount: Number(rowCount),
      rowHeightPx: Number(rowHeightPx),
      hideBrand,
      columns,
    });
    setPending(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Salvataggio non riuscito.");
      return;
    }
    setMessage("Tabellone salvato.");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Eliminare «${name || board.name}»?`)) return;
    const result = await deletePublicBoard(supabase, board.id);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile eliminare il tabellone.");
      return;
    }
    router.push("/admin/lezioni/tabelloni");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/lezioni/tabelloni" className="text-sm text-[var(--brand)]">
          Tabelloni
        </Link>
        <h1 className="text-lg font-semibold text-neutral-900">{board.name}</h1>
        <div className="ml-auto flex gap-2">
          <Link
            href={`/tabellone/${board.id}`}
            target="_blank"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          >
            Apri
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-neutral-500">Nome</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={settingsInputClass}
            maxLength={80}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-neutral-500">Aula</span>
          <select
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
            className={settingsInputClass}
          >
            <option value="">Tutte le aule</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        {timetable ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-neutral-500">Righe</span>
              <input
                value={rowCount}
                onChange={(event) => setRowCount(event.target.value)}
                inputMode="numeric"
                className={settingsInputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-neutral-500">Altezza px</span>
              <input
                value={rowHeightPx}
                onChange={(event) => setRowHeightPx(event.target.value)}
                inputMode="numeric"
                className={settingsInputClass}
              />
            </label>
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={showIndividuals}
            onChange={(event) => setShowIndividuals(event.target.checked)}
          />
          <span>
            Lezioni individuali
            <span
              className="ml-1 cursor-help text-neutral-400"
              title="Sul tabellone compare il nome e l'iniziale del cognome, al posto del nome del corso."
            >
              ?
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            checked={hideBrand}
            onChange={(event) => setHideBrand(event.target.checked)}
          />
          Nascondi il nome della sede
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {BOARD_LAYOUTS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setLayout(item)}
            className={`rounded-lg p-1 ${layout === item ? "ring-2 ring-[var(--brand)]" : ""}`}
            aria-pressed={layout === item}
          >
            <LayoutThumb layout={item} />
            <span className="mt-1 block text-center text-xs text-neutral-600">
              {layoutLabel(item)}
            </span>
          </button>
        ))}
      </div>

      {timetable ? (
        <section className="space-y-2">
          <div className="flex gap-4 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
            {preview.map((cell, index) => (
              <span key={index} className="shrink-0">
                {cell || "—"}
              </span>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">#</th>
                  <th className="px-2 py-1.5 font-medium">Sul tabellone</th>
                  <th className="px-2 py-1.5 font-medium">In elenco</th>
                  <th className="px-2 py-1.5 font-medium">Valore</th>
                  <th className="px-2 py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {columns.map((column, index) => {
                  const hint =
                    BOARD_COLUMN_CATALOG.find((item) => item.key === column.key)?.hint ??
                    column.key;
                  return (
                    <tr key={`${column.key}-${index}`} className="border-b border-neutral-100">
                      <td className="px-2 py-1 text-neutral-400">{index + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          value={column.boardLabel}
                          aria-label={`Intestazione ${index + 1}`}
                          onChange={(event) => {
                            const copy = [...columns];
                            copy[index] = { ...column, boardLabel: event.target.value };
                            setColumns(copy);
                          }}
                          className={`${settingsInputClass} py-1`}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          value={column.listLabel}
                          aria-label={`Nome elenco ${index + 1}`}
                          onChange={(event) => {
                            const copy = [...columns];
                            copy[index] = { ...column, listLabel: event.target.value };
                            setColumns(copy);
                          }}
                          className={`${settingsInputClass} py-1`}
                        />
                      </td>
                      <td className="px-2 py-1 text-neutral-500">{hint}</td>
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        <button type="button" className="px-1" onClick={() => move(index, -1)} aria-label="Su">
                          ↑
                        </button>
                        <button type="button" className="px-1" onClick={() => move(index, 1)} aria-label="Giù">
                          ↓
                        </button>
                        <button
                          type="button"
                          className="px-1 text-red-700"
                          onClick={() => setColumns(columns.filter((_, item) => item !== index))}
                          aria-label="Elimina colonna"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={addKey}
              onChange={(event) => setAddKey(event.target.value as BoardColumnKey)}
              className={`${settingsInputClass} w-auto`}
              aria-label="Colonna da aggiungere"
            >
              {BOARD_COLUMN_CATALOG.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.listLabel}
                </option>
              ))}
            </select>
            <button type="button" onClick={addColumn} className="text-sm text-[var(--brand)]">
              Aggiungi colonna
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-green-800">{message}</p> : null}
      <button type="button" onClick={remove} className="text-sm text-red-700">
        Elimina tabellone
      </button>
    </div>
  );
}
