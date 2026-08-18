"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  emailFiscalReceiptCopy,
  fiscalReceiptsCsv,
  formatEuro,
  getFiscalReceipt,
  listFiscalReceipts,
  replaceFiscalReceipt,
  todayInRome,
  type FiscalReceiptRow,
} from "@musicpro/database";

import { generateFiscalReceiptPdf } from "@/lib/lezioni/fiscal-receipt-pdf";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function yearStartInRome(): string {
  return `${todayInRome().slice(0, 4)}-01-01`;
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

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

function methodLabel(method: string): string {
  if (method === "stripe") return "Carta / Stripe";
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  if (method === "altro") return "Altro";
  return method;
}

function statusLabel(status: FiscalReceiptRow["status"]): string {
  return status === "sostituita" ? "Sostituita" : "Emessa";
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}

function downloadTextFile(filename: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReceiptsPanel({ actorMemberId }: { actorMemberId: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [from, setFrom] = useState(yearStartInRome);
  const [to, setTo] = useState(todayInRome);
  const [rows, setRows] = useState<FiscalReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmReplaceId, setConfirmReplaceId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listFiscalReceipts(supabase, {
        from,
        to,
        includeReplaced: true,
      });
      setRows(list);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Impossibile caricare le ricevute.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [from, supabase, to]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const issuedRows = useMemo(
    () => rows.filter((row) => row.status === "emessa"),
    [rows],
  );
  const issuedTotal = useMemo(
    () => issuedRows.reduce((sum, row) => sum + row.amountEur, 0),
    [issuedRows],
  );

  async function handleSend(row: FiscalReceiptRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const pdf = await generateFiscalReceiptPdf(row);
      const result = await emailFiscalReceiptCopy(supabase, {
        receiptId: row.id,
        attachments: [
          {
            filename: pdf.filename,
            contentBase64: bytesToBase64(pdf.bytes),
          },
        ],
      });
      if (!result.success) {
        setError(result.errorMessage ?? "Impossibile inviare la copia.");
        return;
      }
      const extra =
        result.warnings && result.warnings.length > 0
          ? ` ${result.warnings.join(" ")}`
          : "";
      setNotice(`Copia di ${row.code} inviata alla famiglia.${extra}`);
      await loadRows();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Impossibile generare il PDF.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleReplace(row: FiscalReceiptRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const replaced = await replaceFiscalReceipt(supabase, {
      receiptId: row.id,
      actorMemberId,
    });
    if (!replaced.success || !replaced.id) {
      setBusyId(null);
      setError(replaced.errorMessage ?? "Impossibile stornare la ricevuta.");
      return;
    }

    let emailed = false;
    try {
      const fresh = await getFiscalReceipt(supabase, replaced.id);
      if (fresh) {
        const pdf = await generateFiscalReceiptPdf(fresh);
        const mailed = await emailFiscalReceiptCopy(supabase, {
          receiptId: fresh.id,
          attachments: [
            {
              filename: pdf.filename,
              contentBase64: bytesToBase64(pdf.bytes),
            },
          ],
        });
        emailed = mailed.success;
        if (!mailed.success && mailed.errorMessage) {
          setError(mailed.errorMessage);
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Storno ok, ma la nuova copia non è partita.",
      );
    }

    setConfirmReplaceId(null);
    setBusyId(null);
    setNotice(
      emailed
        ? `Ricevuta ${row.code} stornata. Inviata la nuova copia.`
        : `Ricevuta ${row.code} stornata. Nuova ricevuta emessa.`,
    );
    await loadRows();
  }

  function handleRegistro() {
    const csv = fiscalReceiptsCsv(issuedRows);
    downloadTextFile(
      `registro-ricevute-${from}_${to}.csv`,
      `\uFEFF${csv}`,
      "text/csv;charset=utf-8",
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-[var(--brand)]">Ricevute</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Matrice sezionale S/n/anno. Le sostituite restano in elenco e non
          entrano nel totale.
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

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Dal</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Al</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="button"
          onClick={handleRegistro}
          disabled={issuedRows.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          Registro
        </button>
        <p className="pb-2 text-sm text-neutral-600">
          Totale emesse:{" "}
          <span className="font-medium text-neutral-900">
            {formatEuro(issuedTotal)}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Caricamento…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessuna ricevuta in questo periodo.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Numero</th>
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Intestatario</th>
                <th className="px-4 py-3 font-medium">Importo</th>
                <th className="px-4 py-3 font-medium">Metodo</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Inviata</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-neutral-100 align-top">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {row.code}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {formatShortDate(row.issuedOn)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.payeeName}</td>
                  <td className="px-4 py-3 text-neutral-900">
                    {formatEuro(row.amountEur)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {methodLabel(row.method)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {statusLabel(row.status)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {row.emailedAt ? formatDateTimeIt(row.emailedAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {row.status === "emessa" ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSend(row)}
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
                          >
                            {busyId === row.id ? "…" : "Invia"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmReplaceId(row.id);
                              setError(null);
                            }}
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                          >
                            Storno
                          </button>
                        </div>
                        {confirmReplaceId === row.id ? (
                          <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                            <p className="text-xs text-neutral-600">
                              Si emette una nuova ricevuta. {row.code} passa a
                              sostituita.
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleReplace(row)}
                                disabled={busyId === row.id}
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                Conferma
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmReplaceId(null)}
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
