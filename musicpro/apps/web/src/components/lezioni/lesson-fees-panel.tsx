"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatEuro,
  listLessonFees,
  listMembers,
  registerFamilyCollection,
  sendFeeDunning,
  todayInRome,
  waiveLessonFee,
  type LessonFeeRow,
  type LessonFeeStatus,
  type MemberSummary,
} from "@musicpro/database";

import { issueAndEmailReceiptCopy } from "@/lib/lezioni/issue-receipt-copy";
import { createClient } from "@/lib/supabase/client";

type StatusFilter = "default" | "open" | "paid" | "all";
type CollectionMethod = "bonifico" | "altro";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "default", label: "Scadute e in scadenza" },
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

  const selectedCollectMember = members.find((row) => row.id === collectMemberId);

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

    let extra = "";
    if (result.id) {
      try {
        const emailed = await issueAndEmailReceiptCopy(
          supabase,
          result.id,
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
  }

  return (
    <div className="space-y-8">
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
          <span className="mb-1 block text-neutral-600">Cerca allievo o tutore</span>
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
    </div>
  );
}
