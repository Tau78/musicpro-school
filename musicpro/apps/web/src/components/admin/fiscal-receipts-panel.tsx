"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  emailFiscalReceiptCopy,
  fiscalReceiptsCsv,
  formatEuro,
  getFiscalReceipt,
  FISCAL_RECEIPT_SECTION_CODES,
  fiscalReceiptSectionFilterCodes,
  fiscalReceiptSectionLabel,
  listFiscalReceipts,
  replaceFiscalReceipt,
  todayInRome,
  type FiscalReceiptRow,
  type FiscalReceiptSectionCode,
} from "@musicpro/database";

import {
  annulFiscalReceipt,
  updateFiscalReceiptFields,
} from "@/lib/admin/fiscal-receipt-mutations";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { generateFiscalReceiptPdf } from "@/lib/lezioni/fiscal-receipt-pdf";
import { createClient } from "@/lib/supabase/client";

type ReceiptStatus = FiscalReceiptRow["status"] | "annullata";
type SectionFilter = "all" | FiscalReceiptSectionCode;
type PeriodPreset = "last_month" | "quarter" | "year" | "custom";

const inputClass =
  "w-full min-w-0 max-w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

const SECTION_CHIPS: { id: SectionFilter; label: string }[] = [
  { id: "all", label: "Tutte" },
  ...FISCAL_RECEIPT_SECTION_CODES.map((id) => ({
    id,
    label: id,
  })),
];

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: "last_month", label: "Ultimo mese" },
  { id: "quarter", label: "Trimestre in corso" },
  { id: "year", label: "Anno in corso" },
  { id: "custom", label: "Personalizzata" },
];

function chipClass(active: boolean): string {
  return `inline-flex shrink-0 items-center rounded-md px-3 py-1.5 text-xs font-medium touch-manipulation transition-colors ${
    active
      ? "bg-[var(--brand)] text-white shadow-sm"
      : "bg-neutral-100/80 text-neutral-700 hover:bg-neutral-200"
  }`;
}

function yearStartInRome(): string {
  return `${todayInRome().slice(0, 4)}-01-01`;
}

function subtractMonthsRome(months: number): string {
  const today = todayInRome();
  const [y, m, d] = today.split("-").map((part) => Number.parseInt(part, 10));
  const dt = new Date(y, m - 1 - months, d);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function quarterStartInRome(): string {
  const today = todayInRome();
  const month = Number.parseInt(today.slice(5, 7), 10);
  const qStart = Math.floor((month - 1) / 3) * 3 + 1;
  return `${today.slice(0, 4)}-${String(qStart).padStart(2, "0")}-01`;
}

function periodRange(preset: PeriodPreset): { from: string; to: string } {
  const to = todayInRome();
  if (preset === "last_month") {
    return { from: subtractMonthsRome(1), to };
  }
  if (preset === "quarter") {
    return { from: quarterStartInRome(), to };
  }
  if (preset === "year") {
    return { from: yearStartInRome(), to };
  }
  return { from: yearStartInRome(), to };
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
  if (method === "stripe" || method === "nexi") return "Carta / Nexi";
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  if (method === "altro") return "Altro";
  return method;
}

function receiptStatus(row: FiscalReceiptRow): ReceiptStatus {
  const status = row.status as ReceiptStatus;
  if (
    status === "emessa" ||
    status === "sostituita" ||
    status === "annullata"
  ) {
    return status;
  }
  return "emessa";
}

function statusLabel(status: ReceiptStatus): string {
  if (status === "sostituita") return "Sostituita";
  if (status === "annullata") return "Annullata";
  return "Emessa";
}

function receiptSection(row: FiscalReceiptRow): string {
  return row.section?.trim() || row.code.split("/")[0]?.trim() || "SCH";
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

function exportRowsXls(rows: FiscalReceiptRow[]) {
  const base = fiscalReceiptsCsv(rows);
  const headerExtra = "sezionale;stato";
  const [header, ...dataLines] = base.split("\n");
  const lines = dataLines.map((line, index) => {
    const row = rows[index];
    if (!row) return line;
    const section = receiptSection(row);
    const stato = statusLabel(receiptStatus(row));
    const escapedSection = section.includes(";") ? `"${section}"` : section;
    const escapedStato = stato.includes(";") ? `"${stato}"` : stato;
    return `${line};${escapedSection};${escapedStato}`;
  });
  const csv = [`${header};${headerExtra}`, ...lines].join("\n");
  downloadTextFile(
    `ricevute-${todayInRome()}.xls`,
    `\uFEFF${csv}`,
    "application/vnd.ms-excel",
  );
}

type EditDraft = {
  payeeName: string;
  payeeTaxCode: string;
  payeeEmail: string;
  issuedOn: string;
  method: string;
};

export function FiscalReceiptsPanel({
  actorMemberId,
}: {
  actorMemberId: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("year");
  const [from, setFrom] = useState(yearStartInRome);
  const [to, setTo] = useState(todayInRome);
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>("all");
  const [rows, setRows] = useState<FiscalReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmReplaceId, setConfirmReplaceId] = useState<string | null>(null);
  const [confirmAnnulId, setConfirmAnnulId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  useEffect(() => {
    if (periodPreset === "custom") return;
    const range = periodRange(periodPreset);
    setFrom(range.from);
    setTo(range.to);
  }, [periodPreset]);

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

  const filteredRows = useMemo(() => {
    if (sectionFilter === "all") return rows;
    const codes = fiscalReceiptSectionFilterCodes(sectionFilter);
    return rows.filter((row) => codes.includes(receiptSection(row)));
  }, [rows, sectionFilter]);

  const issuedRows = useMemo(
    () =>
      filteredRows.filter((row) => receiptStatus(row) === "emessa"),
    [filteredRows],
  );

  const issuedTotal = useMemo(
    () => issuedRows.reduce((sum, row) => sum + row.amountEur, 0),
    [issuedRows],
  );

  function openEdit(row: FiscalReceiptRow) {
    setEditId(row.id);
    setEditDraft({
      payeeName: row.payeeName,
      payeeTaxCode: row.payeeTaxCode ?? "",
      payeeEmail: row.payeeEmail ?? "",
      issuedOn: row.issuedOn.slice(0, 10),
      method: row.method,
    });
    setConfirmReplaceId(null);
    setConfirmAnnulId(null);
    setError(null);
  }

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

  async function handleAnnul(row: FiscalReceiptRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await annulFiscalReceipt(supabase, row.id);
    setBusyId(null);
    setConfirmAnnulId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile annullare la ricevuta.");
      return;
    }
    setNotice(`Ricevuta ${row.code} annullata.`);
    await loadRows();
  }

  async function handleSaveEdit(row: FiscalReceiptRow) {
    if (!editDraft) return;
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await updateFiscalReceiptFields(supabase, row.id, {
      payeeName: editDraft.payeeName,
      payeeTaxCode: editDraft.payeeTaxCode || null,
      payeeEmail: editDraft.payeeEmail || null,
      issuedOn: editDraft.issuedOn,
      method: editDraft.method,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile salvare le modifiche.");
      return;
    }
    setEditId(null);
    setEditDraft(null);
    setNotice(`Ricevuta ${row.code} aggiornata.`);
    await loadRows();
  }

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <SettingsPageHeader
        title="Ricevute"
        description="Registro unificato per quota, sala, lezioni e test. Le sostituite e le annullate restano in elenco; nel totale contano solo le emesse."
      />

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

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        {SECTION_CHIPS.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setSectionFilter(chip.id)}
            className={chipClass(sectionFilter === chip.id)}
            title={
              chip.id === "all"
                ? "Tutti i sezionali"
                : fiscalReceiptSectionLabel(chip.id)
            }
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
        <label className="block min-w-0 text-sm">
          <span className="mb-1 block text-neutral-600">Periodo</span>
          <select
            value={periodPreset}
            onChange={(e) => {
              setPeriodPreset(e.target.value as PeriodPreset);
            }}
            className={`${inputClass} min-w-[11rem]`}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {periodPreset === "custom" ? (
          <>
            <label className="block min-w-0 flex-1 text-sm sm:max-w-[10rem]">
              <span className="mb-1 block text-neutral-600">Dal</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block min-w-0 flex-1 text-sm sm:max-w-[10rem]">
              <span className="mb-1 block text-neutral-600">Al</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
              />
            </label>
          </>
        ) : (
          <p className="pb-2 text-sm text-neutral-600">
            {formatShortDate(from)} – {formatShortDate(to)}
          </p>
        )}
        <button
          type="button"
          onClick={() => exportRowsXls(filteredRows)}
          disabled={filteredRows.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          Esporta .xls
        </button>
        <p className="w-full pb-0 text-sm text-neutral-600 sm:w-auto sm:pb-2">
          Totale emesse:{" "}
          <span className="font-medium text-neutral-900">
            {formatEuro(issuedTotal)}
          </span>
        </p>
      </div>

      <div className="max-w-full overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Caricamento…
          </p>
        ) : filteredRows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessuna ricevuta in questo periodo.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-3 py-2.5 font-medium">Numero</th>
                <th className="px-3 py-2.5 font-medium">Sez.</th>
                <th className="px-3 py-2.5 font-medium">Data</th>
                <th className="px-3 py-2.5 font-medium">Intestatario</th>
                <th className="px-3 py-2.5 font-medium">Importo</th>
                <th className="px-3 py-2.5 font-medium">Metodo</th>
                <th className="px-3 py-2.5 font-medium">Stato</th>
                <th className="px-3 py-2.5 font-medium">Inviata</th>
                <th className="px-3 py-2.5 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const status = receiptStatus(row);
                const annulled = status === "annullata";
                const emessa = status === "emessa";
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-neutral-100 align-top ${
                      annulled ? "bg-red-50/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      <span
                        className={
                          annulled
                            ? "text-red-800 line-through decoration-red-400"
                            : "text-neutral-900"
                        }
                      >
                        {row.code}
                      </span>
                      {annulled ? (
                        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                          ANNULLATA
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">
                      {receiptSection(row)}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">
                      {formatShortDate(row.issuedOn)}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">
                      {row.payeeName}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-900">
                      {formatEuro(row.amountEur)}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">
                      {methodLabel(row.method)}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-700">
                      {statusLabel(status)}
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500">
                      {row.emailedAt ? formatDateTimeIt(row.emailedAt) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {emessa ? (
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
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
                              onClick={() => openEdit(row)}
                              disabled={busyId === row.id}
                              className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
                            >
                              Modifica
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmAnnulId(row.id);
                                setConfirmReplaceId(null);
                                setEditId(null);
                                setError(null);
                              }}
                              disabled={busyId === row.id}
                              className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                            >
                              Annulla
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmReplaceId(row.id);
                                setConfirmAnnulId(null);
                                setEditId(null);
                                setError(null);
                              }}
                              disabled={busyId === row.id}
                              className="text-sm font-medium text-neutral-700 hover:underline disabled:opacity-50"
                            >
                              Sostituire
                            </button>
                          </div>
                          {editId === row.id && editDraft ? (
                            <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="block text-xs sm:col-span-2">
                                  <span className="text-neutral-600">
                                    Intestatario
                                  </span>
                                  <input
                                    value={editDraft.payeeName}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        payeeName: e.target.value,
                                      })
                                    }
                                    className={inputClass}
                                  />
                                </label>
                                <label className="block text-xs">
                                  <span className="text-neutral-600">CF</span>
                                  <input
                                    value={editDraft.payeeTaxCode}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        payeeTaxCode: e.target.value,
                                      })
                                    }
                                    className={inputClass}
                                  />
                                </label>
                                <label className="block text-xs">
                                  <span className="text-neutral-600">Email</span>
                                  <input
                                    type="email"
                                    value={editDraft.payeeEmail}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        payeeEmail: e.target.value,
                                      })
                                    }
                                    className={inputClass}
                                  />
                                </label>
                                <label className="block text-xs">
                                  <span className="text-neutral-600">Data</span>
                                  <input
                                    type="date"
                                    value={editDraft.issuedOn}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        issuedOn: e.target.value,
                                      })
                                    }
                                    className={inputClass}
                                  />
                                </label>
                                <label className="block text-xs">
                                  <span className="text-neutral-600">
                                    Metodo
                                  </span>
                                  <select
                                    value={editDraft.method}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        method: e.target.value,
                                      })
                                    }
                                    className={inputClass}
                                  >
                                    <option value="contanti">Contanti</option>
                                    <option value="bonifico">Bonifico</option>
                                    <option value="stripe">Carta / Stripe</option>
                                    <option value="nexi">Nexi</option>
                                    <option value="altro">Altro</option>
                                  </select>
                                </label>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveEdit(row)}
                                  disabled={busyId === row.id}
                                  className="btn-brand rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  Salva
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditId(null);
                                    setEditDraft(null);
                                  }}
                                  className="text-xs text-neutral-600 hover:underline"
                                >
                                  Chiudi
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {confirmAnnulId === row.id ? (
                            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/80 p-2">
                              <p className="text-xs text-red-800">
                                Annullare {row.code}? Il numero non si riusa.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleAnnul(row)}
                                  disabled={busyId === row.id}
                                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  Conferma annullo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmAnnulId(null)}
                                  className="text-xs text-neutral-600 hover:underline"
                                >
                                  Indietro
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {confirmReplaceId === row.id ? (
                            <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                              <p className="text-xs text-neutral-600">
                                Si emette una nuova ricevuta. {row.code} passa a
                                sostituita.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleReplace(row)}
                                  disabled={busyId === row.id}
                                  className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                >
                                  Conferma storno
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmReplaceId(null)}
                                  className="text-xs text-neutral-600 hover:underline"
                                >
                                  Indietro
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
