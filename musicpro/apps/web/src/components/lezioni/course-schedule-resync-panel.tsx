"use client";

import { useMemo, useState } from "react";

import {
  formatBookingDateTime,
  type ApplyCourseScheduleRow,
  type CourseSchedulePreview,
  type CourseSchedulePreviewRow,
} from "@musicpro/database";

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function rowLabel(row: CourseSchedulePreviewRow): string {
  if (row.placement === "da_piazzare") {
    return "Recupero festivo · da piazzare";
  }
  if (row.startsAt && row.endsAt) {
    return formatBookingDateTime(row.startsAt, row.endsAt);
  }
  return formatShortDate(row.date);
}

function rowHint(row: CourseSchedulePreviewRow): string | null {
  if (row.kind === "holiday_makeup" && row.replacedHolidayDate) {
    return `Recupero del ${formatShortDate(row.replacedHolidayDate)}`;
  }
  if (row.kind === "manual_holiday") {
    return "Su giorno festivo/chiusura";
  }
  return null;
}

export function CourseScheduleResyncPanel({
  preview,
  busy = false,
  onCancel,
  onConfirm,
}: {
  preview: CourseSchedulePreview;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (rows: ApplyCourseScheduleRow[]) => void;
}) {
  const [rows, setRows] = useState(preview.rows);

  const includedCount = useMemo(
    () => rows.filter((row) => row.included).length,
    [rows],
  );

  const addedHolidayKeys = useMemo(
    () =>
      new Set(
        rows
          .filter((row) => row.kind === "manual_holiday")
          .map((row) => row.replacedHolidayDate ?? row.date),
      ),
    [rows],
  );

  function toggleRow(rowKey: string) {
    setRows((current) =>
      current.map((row) =>
        row.rowKey === rowKey ? { ...row, included: !row.included } : row,
      ),
    );
  }

  function addHolidayLesson(date: string) {
    if (addedHolidayKeys.has(date)) return;
    setRows((current) => [
      ...current,
      {
        rowKey: `manual:${date}`,
        date,
        startsAt: null,
        endsAt: null,
        placement: "scheduled",
        kind: "manual_holiday",
        replacedHolidayDate: date,
        included: true,
      },
    ]);
  }

  function handleConfirm() {
    onConfirm(
      rows.map((row) => ({
        rowKey: row.rowKey,
        date: row.date,
        included: row.included,
        kind: row.kind,
        replacedHolidayDate: row.replacedHolidayDate,
      })),
    );
  }

  return (
    <section className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand)]/5 px-3.5 py-3 shadow-sm">
      <h4 className="text-sm font-semibold text-[var(--brand)]">
        Nuova programmazione
      </h4>
      <p className="mt-1 text-xs text-neutral-600">
        Come in creazione corso: controlla le lezioni future, escludi quelle che
        non servono o riaggiungi un festivo. Poi salva.
      </p>

      {preview.warnings.length > 0 ? (
        <ul className="mt-2 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <ul className="mt-3 max-h-64 divide-y divide-neutral-200 overflow-y-auto rounded-lg border border-neutral-200 bg-white">
        {rows.length === 0 ? (
          <li className="px-3 py-3 text-sm text-neutral-500">
            Nessuna lezione futura da programmare.
          </li>
        ) : (
          rows.map((row) => (
            <li
              key={row.rowKey}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${row.included ? "text-neutral-900" : "text-neutral-400 line-through"}`}
                >
                  {rowLabel(row)}
                </p>
                {rowHint(row) ? (
                  <p className="text-xs text-neutral-500">{rowHint(row)}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggleRow(row.rowKey)}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium ${
                  row.included
                    ? "border border-red-200 bg-white text-red-700 hover:bg-red-50"
                    : "border border-green-200 bg-white text-green-800 hover:bg-green-50"
                }`}
              >
                {row.included ? "Escludi" : "Includi"}
              </button>
            </li>
          ))
        )}
      </ul>

      {preview.skippedHolidays.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-neutral-600">
            Festivi esclusi (puoi riammettere)
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {preview.skippedHolidays.map((date) => {
              const added = addedHolidayKeys.has(date);
              return (
                <button
                  key={date}
                  type="button"
                  disabled={busy || added}
                  onClick={() => addHolidayLesson(date)}
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {added ? "Aggiunto" : `+ ${formatShortDate(date)}`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || includedCount === 0}
          onClick={handleConfirm}
          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Salvataggio…" : `Salva (${includedCount} lezioni)`}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Annulla
        </button>
      </div>
    </section>
  );
}
