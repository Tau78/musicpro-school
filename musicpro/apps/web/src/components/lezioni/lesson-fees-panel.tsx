"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatEuro,
  getMemberLessonPaymentHistory,
  listLessonFees,
  listMembers,
  registerFamilyCollection,
  sendFeeDunning,
  todayInRome,
  waiveLessonFee,
  type LessonFeeRow,
  type LessonFeeStatus,
  type LessonPackPaymentMethod,
  type MemberLessonPaymentHistory,
  type MemberSummary,
} from "@musicpro/database";

import { issueAndEmailReceiptCopy } from "@/lib/lezioni/issue-receipt-copy";
import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import { createClient } from "@/lib/supabase/client";

type StatusFilter = "default" | "open" | "paid" | "all";
type CollectionMethod = "bonifico" | "altro";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "default", label: "In scadenza" },
  { value: "open", label: "Aperte" },
  { value: "paid", label: "Saldate" },
  { value: "all", label: "Tutte" },
];

function memberLabel(member: MemberSummary): string {
  const name = `${member.lastName} ${member.firstName}`.trim();
  return member.memberNumber != null ? `${name} (#${member.memberNumber})` : name;
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
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

function isOpenStatus(status: LessonFeeStatus): boolean {
  return status === "aperta" || status === "parziale";
}

function parseEuroAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function paymentMethodLabel(method: LessonPackPaymentMethod): string {
  if (method === "stripe") return "Stripe";
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  return "Altro";
}

function paymentDisplayDate(paidOn: string | null, createdAt: string): string {
  if (paidOn && /^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
    return formatShortDate(paidOn);
  }
  return formatDateTimeIt(createdAt);
}

function listOptions(filter: StatusFilter): {
  mode?: "default" | "all";
  status?: LessonFeeStatus[];
} {
  if (filter === "default") return { mode: "default" };
  if (filter === "open") return { mode: "all", status: ["aperta", "parziale"] };
  if (filter === "paid") return { mode: "all", status: ["saldata"] };
  return { mode: "all" };
}

export function LessonFeesPanel({
  actorMemberId,
  paymentReceived = false,
}: {
  actorMemberId: string;
  paymentReceived?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [fees, setFees] = useState<LessonFeeRow[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    paymentReceived
      ? "Pagamento ricevuto. I crediti si aggiornano entro un minuto."
      : null,
  );

  const [nameQuery, setNameQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("default");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [waiveId, setWaiveId] = useState<string | null>(null);
  const [waiveNote, setWaiveNote] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [collectQuery, setCollectQuery] = useState("");
  const [collectMemberId, setCollectMemberId] = useState<string | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectDate, setCollectDate] = useState(todayInRome);
  const [collectMethod, setCollectMethod] = useState<CollectionMethod>("bonifico");
  const [collectCro, setCollectCro] = useState("");
  const [collectNote, setCollectNote] = useState("");
  const [collecting, setCollecting] = useState(false);

  const [historyQuery, setHistoryQuery] = useState("");
  const [historyMemberId, setHistoryMemberId] = useState<string | null>(null);
  const [history, setHistory] = useState<MemberLessonPaymentHistory | null>(
    null,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCollectingId, setHistoryCollectingId] = useState<string | null>(
    null,
  );

  const loadFees = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listLessonFees(supabase, listOptions(statusFilter));
      setFees(rows);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Impossibile caricare le rette.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, supabase]);

  const loadHistory = useCallback(
    async (memberId: string) => {
      setHistoryLoading(true);
      try {
        const rows = await getMemberLessonPaymentHistory(supabase, memberId);
        setHistory(rows);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Impossibile caricare lo storico.";
        setError(message);
        setHistory(null);
      } finally {
        setHistoryLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  useEffect(() => {
    void listMembers(supabase)
      .then(setMembers)
      .catch((err: unknown) => {
        const message =
          err instanceof Error
            ? err.message
            : "Impossibile caricare gli associati.";
        setError(message);
      });
  }, [supabase]);

  useEffect(() => {
    if (!historyMemberId) {
      setHistory(null);
      return;
    }
    void loadHistory(historyMemberId);
  }, [historyMemberId, loadHistory]);

  const visibleFees = useMemo(() => {
    const term = nameQuery.trim().toLowerCase();
    if (!term) return fees;
    return fees.filter((row) => {
      const hay = `${row.studentLabel} ${row.tutorLabel}`.toLowerCase();
      return hay.includes(term);
    });
  }, [fees, nameQuery]);

  const collectMatches = useMemo(() => {
    const term = collectQuery.trim().toLowerCase();
    if (!term) return [];
    return members
      .filter((row) => row.isActive)
      .filter((row) => {
        const hay =
          `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [collectQuery, members]);

  const historyMatches = useMemo(() => {
    const term = historyQuery.trim().toLowerCase();
    if (!term) return [];
    return members
      .filter((row) => row.isActive)
      .filter((row) => {
        const hay =
          `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [historyQuery, members]);

  const selectedCollectMember = members.find((row) => row.id === collectMemberId);
  const selectedHistoryMember = members.find((row) => row.id === historyMemberId);

  async function afterSuccessfulCollection(paymentId: string | undefined) {
    let extra = "";
    if (paymentId) {
      try {
        const emailed = await issueAndEmailReceiptCopy(
          supabase,
          paymentId,
          actorMemberId,
        );
        if (!emailed.success) {
          extra =
            emailed.errorMessage ??
            "Ricevuta da inviare dalla scheda Ricevute.";
        }
      } catch {
        extra = "Ricevuta da inviare dalla scheda Ricevute.";
      }
    }

    setNotice(
      extra
        ? `Incasso registrato. ${extra}`
        : "Incasso registrato. Ricevuta inviata alla famiglia.",
    );
    await loadFees();
    if (historyMemberId) {
      await loadHistory(historyMemberId);
    }
  }

  async function handleDunning(row: LessonFeeRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await sendFeeDunning(supabase, [row.id], actorMemberId);
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile inviare il sollecito.");
      return;
    }
    const extra =
      result.warnings && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    setNotice(`Sollecito inviato a ${row.studentLabel}.${extra}`);
    await loadFees();
  }

  async function handleBulkDunning() {
    const targets = visibleFees.filter((row) => isOpenStatus(row.status));
    if (targets.length === 0) {
      setError("Nessuna retta aperta tra i risultati filtrati.");
      return;
    }
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    const result = await sendFeeDunning(
      supabase,
      targets.map((row) => row.id),
      actorMemberId,
    );
    setBulkBusy(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile inviare i solleciti.");
      return;
    }
    const extra =
      result.warnings && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    setNotice(`Sollecito inviato a ${targets.length} rette.${extra}`);
    await loadFees();
  }

  async function handleWaive(row: LessonFeeRow) {
    const note = waiveNote.trim();
    if (!note) {
      setError("La nota è obbligatoria per l’abbuono.");
      return;
    }
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    const result = await waiveLessonFee(supabase, row.id, note, actorMemberId);
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile abbuonare la retta.");
      return;
    }
    setWaiveId(null);
    setWaiveNote("");
    setNotice(`Abbuono registrato per ${row.studentLabel}.`);
    await loadFees();
    if (historyMemberId) {
      await loadHistory(historyMemberId);
    }
  }

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    if (!collectMemberId) {
      setError("Seleziona un allievo.");
      return;
    }
    const amount = parseEuroAmount(collectAmount);
    if (amount == null) {
      setError("Inserisci un importo in euro maggiore di zero.");
      return;
    }

    setCollecting(true);
    setError(null);
    setNotice(null);

    const result = await registerFamilyCollection(supabase, {
      memberId: collectMemberId,
      amountEur: amount,
      method: collectMethod,
      paidOn: collectDate,
      note: collectNote.trim() || undefined,
      cro: collectCro.trim() || undefined,
      actorMemberId,
    });

    setCollecting(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile registrare l’incasso.");
      return;
    }

    setCollectQuery("");
    setCollectMemberId(null);
    setCollectAmount("");
    setCollectDate(todayInRome());
    setCollectMethod("bonifico");
    setCollectCro("");
    setCollectNote("");

    await afterSuccessfulCollection(result.id);
  }

  async function handleHistoryIncassa(fee: LessonFeeRow) {
    const amount = Math.round(fee.remainingEur * 100) / 100;
    if (!(amount > 0)) {
      setError("Residuo non valido per questa retta.");
      return;
    }

    setHistoryCollectingId(fee.id);
    setError(null);
    setNotice(null);

    const result = await registerFamilyCollection(supabase, {
      memberId: fee.memberId,
      amountEur: amount,
      method: "bonifico",
      paidOn: todayInRome(),
      note: `Incasso da storico — ${fee.kind === "quota" ? "quota" : fee.courseName || "pacchetto"}`,
      actorMemberId,
    });

    setHistoryCollectingId(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile registrare l’incasso.");
      return;
    }

    await afterSuccessfulCollection(result.id);
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Rette"
        description="Quote lezioni in scadenza, incassi e solleciti agli associati."
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

      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1 text-sm">
          <span className="mb-1 block text-neutral-600">Cerca</span>
          <input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Nome…"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Stato</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className={inputClass}
          >
            {STATUS_FILTERS.map((row) => (
              <option key={row.value} value={row.value}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void handleBulkDunning()}
          disabled={bulkBusy || visibleFees.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          {bulkBusy ? "Invio…" : "Sollecito massivo"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Caricamento…
          </p>
        ) : visibleFees.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessuna retta in questa vista.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Allievo</th>
                <th className="px-4 py-3 font-medium">Tutore</th>
                <th className="px-4 py-3 font-medium">Corso</th>
                <th className="px-4 py-3 font-medium">Residuo</th>
                <th className="px-4 py-3 font-medium">Scadenza</th>
                <th className="px-4 py-3 font-medium">Ultimo sollecito</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visibleFees.map((row) => (
                <tr key={row.id} className="border-b border-neutral-100 align-top">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {row.studentLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.tutorLabel || "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.kind === "quota" ? "Quota" : row.courseName || "Corso"}
                  </td>
                  <td className="px-4 py-3 text-neutral-900">
                    {formatEuro(row.remainingEur)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {formatShortDate(row.dueOn)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {row.lastDunningAt
                      ? formatDateTimeIt(row.lastDunningAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {isOpenStatus(row.status) ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDunning(row)}
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
                          >
                            {busyId === row.id ? "…" : "Sollecito"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWaiveId(row.id);
                              setWaiveNote("");
                              setError(null);
                            }}
                            disabled={busyId === row.id}
                            className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                          >
                            Abbuono
                          </button>
                        </div>
                        {waiveId === row.id ? (
                          <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
                            <input
                              value={waiveNote}
                              onChange={(e) => setWaiveNote(e.target.value)}
                              placeholder="Nota obbligatoria"
                              className={inputClass}
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => void handleWaive(row)}
                                disabled={busyId === row.id}
                                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                Conferma
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setWaiveId(null);
                                  setWaiveNote("");
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

      <form onSubmit={(e) => void handleCollect(e)} className="space-y-4">
        <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
            Registra incasso
          </legend>
          <p className="text-sm text-neutral-600">
            L’importo si spalma in FIFO su tutte le rette aperte della famiglia.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-neutral-600">Allievo *</span>
              {selectedCollectMember ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-800">
                    {memberLabel(selectedCollectMember)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCollectMemberId(null);
                      setCollectQuery("");
                    }}
                    className="text-neutral-500 hover:text-neutral-900"
                    aria-label="Rimuovi allievo"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="search"
                    value={collectQuery}
                    onChange={(e) => setCollectQuery(e.target.value)}
                    placeholder="Cerca allievo…"
                    className={inputClass}
                  />
                  {collectQuery.trim() ? (
                    <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                      {collectMatches.length === 0 ? (
                        <li className="px-3 py-2 text-neutral-500">
                          Nessun associato trovato.
                        </li>
                      ) : (
                        collectMatches.map((member) => (
                          <li key={member.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setCollectMemberId(member.id);
                                setCollectQuery("");
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-neutral-50"
                            >
                              <span>{memberLabel(member)}</span>
                              {member.email ? (
                                <span className="text-neutral-400">
                                  {member.email}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </>
              )}
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Importo €</span>
              <input
                required
                type="text"
                inputMode="decimal"
                value={collectAmount}
                onChange={(e) => setCollectAmount(e.target.value)}
                placeholder="0,00"
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Data</span>
              <input
                required
                type="date"
                value={collectDate}
                onChange={(e) => setCollectDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">Metodo</span>
              <select
                value={collectMethod}
                onChange={(e) =>
                  setCollectMethod(e.target.value as CollectionMethod)
                }
                className={inputClass}
              >
                <option value="bonifico">Bonifico</option>
                <option value="altro">Altro</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">CRO</span>
              <input
                value={collectCro}
                onChange={(e) => setCollectCro(e.target.value)}
                placeholder="Opzionale"
                className={inputClass}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-neutral-600">Nota</span>
              <input
                value={collectNote}
                onChange={(e) => setCollectNote(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={collecting}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {collecting ? "Registrazione…" : "Registra incasso"}
        </button>
      </form>

      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <div>
          <h3 className="text-sm font-semibold text-[var(--brand)]">Storico</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Pagamenti ricevuti, rette da incassare e saldo attuale della famiglia
            (acconto − da incassare).
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Associato</span>
          {selectedHistoryMember ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-800">
                {memberLabel(selectedHistoryMember)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setHistoryMemberId(null);
                  setHistoryQuery("");
                  setHistory(null);
                }}
                className="text-neutral-500 hover:text-neutral-900"
                aria-label="Rimuovi associato"
              >
                ×
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder="Cerca associato…"
                className={inputClass}
              />
              {historyQuery.trim() ? (
                <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  {historyMatches.length === 0 ? (
                    <li className="px-3 py-2 text-neutral-500">
                      Nessun associato trovato.
                    </li>
                  ) : (
                    historyMatches.map((member) => (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryMemberId(member.id);
                            setHistoryQuery("");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-neutral-50"
                        >
                          <span>{memberLabel(member)}</span>
                          {member.email ? (
                            <span className="text-neutral-400">
                              {member.email}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </>
          )}
        </label>

        {!historyMemberId ? (
          <p className="text-sm text-neutral-500">
            Seleziona un associato per vedere lo storico.
          </p>
        ) : historyLoading ? (
          <p className="text-sm text-neutral-500">Caricamento storico…</p>
        ) : history ? (
          <div className="space-y-6">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Pagamenti ricevuti
              </h4>
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="px-3 py-2 font-medium">Importo</th>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Metodo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.received.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-4 text-neutral-500"
                        >
                          Nessun pagamento ricevuto.
                        </td>
                      </tr>
                    ) : (
                      history.received.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-neutral-100 last:border-0"
                        >
                          <td className="px-3 py-2 font-medium text-neutral-900">
                            {formatEuro(row.amountEur)}
                          </td>
                          <td className="px-3 py-2 text-neutral-700">
                            {paymentDisplayDate(row.paidOn, row.createdAt)}
                          </td>
                          <td className="px-3 py-2 text-neutral-700">
                            {paymentMethodLabel(row.method)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Pagamenti da incassare
              </h4>
              <div className="overflow-x-auto rounded-lg border border-neutral-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-neutral-500">
                      <th className="px-3 py-2 font-medium">Allievo</th>
                      <th className="px-3 py-2 font-medium">Voce</th>
                      <th className="px-3 py-2 font-medium">Residuo</th>
                      <th className="px-3 py-2 font-medium">Scadenza</th>
                      <th className="px-3 py-2 font-medium">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.openFees.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-3 py-4 text-neutral-500"
                        >
                          Nulla da incassare.
                        </td>
                      </tr>
                    ) : (
                      history.openFees.map((fee) => (
                        <tr
                          key={fee.id}
                          className="border-b border-neutral-100 last:border-0"
                        >
                          <td className="px-3 py-2 text-neutral-900">
                            {fee.studentLabel || "—"}
                          </td>
                          <td className="px-3 py-2 text-neutral-700">
                            {fee.kind === "quota"
                              ? "Quota"
                              : fee.courseName || "Pacchetto"}
                          </td>
                          <td className="px-3 py-2 font-medium text-neutral-900">
                            {formatEuro(fee.remainingEur)}
                          </td>
                          <td className="px-3 py-2 text-neutral-700">
                            {formatShortDate(fee.dueOn)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => void handleHistoryIncassa(fee)}
                              disabled={historyCollectingId === fee.id}
                              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                            >
                              {historyCollectingId === fee.id
                                ? "…"
                                : "Incassa"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
              <div className="space-y-1 text-sm text-neutral-600">
                <p>Ricevuti: {formatEuro(history.receivedTotalEur)}</p>
                <p>Da incassare: {formatEuro(history.openTotalEur)}</p>
                {history.leftoverEurFamily > 0 ? (
                  <p>Acconto famiglia: {formatEuro(history.leftoverEurFamily)}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Saldo attuale
                </p>
                <p
                  className={`text-xl font-semibold ${
                    history.saldoEur < 0
                      ? "text-red-700"
                      : history.saldoEur > 0
                        ? "text-green-800"
                        : "text-neutral-900"
                  }`}
                >
                  {formatEuro(history.saldoEur)}
                </p>
                <p className="text-xs text-neutral-500">
                  {history.saldoEur < 0
                    ? "In debito"
                    : history.saldoEur > 0
                      ? "In credito"
                      : "A posto"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
