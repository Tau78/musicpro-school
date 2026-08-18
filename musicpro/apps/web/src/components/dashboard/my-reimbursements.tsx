"use client";

import { useState } from "react";

import {
  formatEuro,
  formatReimbursementDateItalian,
  type ReimbursementDisplay,
} from "@musicpro/database";

interface MyReimbursementsProps {
  initialRows: ReimbursementDisplay[];
}

export function MyReimbursements({ initialRows }: MyReimbursementsProps) {
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = rows.filter((row) => row.signatureRequired && !row.signedAt);

  async function sign(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/reimbursements/${encodeURIComponent(id)}/sign`,
        { method: "POST" },
      );
      const payload = (await res.json()) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !payload.success) {
        setError(payload.message ?? "Impossibile firmare la notula.");
        return;
      }
      const signedAt = new Date().toISOString();
      setRows((prev) =>
        prev.map((row) => (row.id === id ? { ...row, signedAt } : row)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la firma.");
    } finally {
      setBusyId(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="mt-2 text-sm text-neutral-600">
        Non hai ancora notule di rimborso.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {pending.length > 0 ? (
        <p className="mb-3 text-sm text-amber-800">
          {pending.length} notula/e da firmare.
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="pb-2 pr-4 font-medium">Documento</th>
              <th className="pb-2 pr-4 font-medium">Importo</th>
              <th className="pb-2 pr-4 font-medium">Data</th>
              <th className="pb-2 font-medium">Firma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((row) => (
              <tr key={row.id} className="text-neutral-800">
                <td className="py-2 pr-4">
                  {row.progressive}/{row.fiscalYear}
                </td>
                <td className="py-2 pr-4">{formatEuro(row.grossAmountEur)}</td>
                <td className="py-2 pr-4">
                  {formatReimbursementDateItalian(row.generatedAt)}
                </td>
                <td className="py-2">
                  {row.signedAt ? (
                    <span className="text-green-700">
                      Firmata {formatReimbursementDateItalian(row.signedAt)}
                    </span>
                  ) : row.signatureRequired ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void sign(row.id)}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                    >
                      {busyId === row.id ? "Firma…" : "Firma notula"}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
