"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  confirmTeacherCashAdvance,
  formatEuro,
  rejectTeacherCashAdvance,
  type TeacherCashAdvanceRow,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function formatDateTimeIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashAdvanceActions({
  advances,
  actorMemberId,
}: {
  advances: TeacherCashAdvanceRow[];
  actorMemberId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleConfirm(row: TeacherCashAdvanceRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await confirmTeacherCashAdvance(supabase, {
      advanceId: row.id,
      actorMemberId,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile confermare l’anticipo.");
      return;
    }
    setNotice(`Anticipo confermato per ${row.teacherLabel || "il docente"}.`);
    router.refresh();
  }

  async function handleReject(row: TeacherCashAdvanceRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await rejectTeacherCashAdvance(supabase, {
      advanceId: row.id,
      actorMemberId,
      note: rejectNote.trim() || undefined,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile scartare l’anticipo.");
      return;
    }
    setRejectId(null);
    setRejectNote("");
    setNotice(
      `Anticipo scartato. I crediti e la ricevuta restano per ${row.studentLabel || "l’allievo"}.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Anticipo docente
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Anticipo docente — i crediti e la ricevuta restano.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {advances.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessun anticipo in attesa.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Docente</th>
                <th className="px-4 py-3 font-medium">Allievo</th>
                <th className="px-4 py-3 font-medium">Corso</th>
                <th className="px-4 py-3 font-medium">Importo</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-neutral-100 align-top"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {row.teacherLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.studentLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.courseName || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {formatEuro(row.amountEur)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {formatDateTimeIt(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "pending" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirm(row)}
                            disabled={busyId === row.id}
                            className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                          >
                            {busyId === row.id && rejectId !== row.id
                              ? "…"
                              : "Conferma"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectId(row.id);
                              setRejectNote("");
                              setError(null);
                            }}
                            disabled={busyId === row.id}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Scarta
                          </button>
                        </div>
                        {rejectId === row.id ? (
                          <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                            <input
                              value={rejectNote}
                              onChange={(e) => setRejectNote(e.target.value)}
                              placeholder="Nota opzionale"
                              className={inputClass}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReject(row)}
                                disabled={busyId === row.id}
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {busyId === row.id ? "…" : "Conferma scarto"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectId(null);
                                  setRejectNote("");
                                }}
                                className="text-xs text-neutral-600 hover:underline"
                              >
                                Annulla
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
