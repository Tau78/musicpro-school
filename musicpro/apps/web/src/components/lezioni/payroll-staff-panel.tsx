"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  addLessonPayrollExtra,
  addMonths,
  closeLessonPayroll,
  formatEuro,
  generateLessonPayroll,
  listLessonPayrolls,
  listMemberIdsWithRole,
  listMembers,
  markLessonPayrollPaid,
  setLessonPayrollWithholding,
  todayInRome,
  unlockLessonPayroll,
  yearMonthFromRomeDate,
  type LessonPayroll,
  type LessonPayrollStatus,
  type MemberSummary,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { SettingsPageHeader } from "@/components/admin/settings-page-chrome";
import {
  downloadLessonPayrollPdf,
  generateLessonPayrollPdf,
} from "@/lib/lezioni/payroll-pdf";
import { createClient } from "@/lib/supabase/client";

type StatusFilter = "all" | LessonPayrollStatus;
type PaidMethod = "bonifico" | "contanti" | "altro";
type RowAction = "withholding" | "paid" | "extra";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "draft", label: "Bozza" },
  { value: "signed", label: "Firmata" },
  { value: "closed", label: "Chiusa" },
];

function previousRomeMonth(): { year: number; month: number } {
  const { year, month } = yearMonthFromRomeDate(todayInRome());
  return addMonths(year, month, -1);
}

function yearOptions(centerYear: number): number[] {
  const years: number[] = [];
  for (let year = centerYear - 2; year <= centerYear + 1; year += 1) {
    years.push(year);
  }
  return years;
}

function memberLabel(member: MemberSummary): string {
  const name = `${member.lastName} ${member.firstName}`.trim();
  return member.memberNumber != null ? `${name} (#${member.memberNumber})` : name;
}

function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

function formatHours(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function monthLabel(year: number, month: number): string {
  return `${MONTHS[month - 1] ?? month} ${year}`;
}

function statusLabel(status: LessonPayrollStatus): string {
  if (status === "draft") return "Bozza";
  if (status === "signed") return "Firmata";
  return "Chiusa";
}

function signedInvoiceLabel(row: LessonPayroll): string {
  const parts: string[] = [];
  if (row.hasSignature) parts.push("Firma");
  if (row.hasInvoice) parts.push(row.invoiceFilename || "Fattura");
  return parts.length > 0 ? parts.join(" + ") : "—";
}

function paidMethodLabel(method: string | null): string {
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  if (method === "altro") return "Altro";
  return method || "";
}

function parseEuroAmount(
  raw: string,
  options?: { allowZero?: boolean },
): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return options?.allowZero ? 0 : null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (!options?.allowZero && value === 0) return null;
  return Math.round(value * 100) / 100;
}

function italianError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.trim()
    ? err.message
    : fallback;
}

export function PayrollStaffPanel({ actorMemberId }: { actorMemberId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const initialMonth = useMemo(() => previousRomeMonth(), []);

  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [rows, setRows] = useState<LessonPayroll[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [teacherIds, setTeacherIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<{
    id: string;
    kind: RowAction;
  } | null>(null);

  const [teacherQuery, setTeacherQuery] = useState("");
  const [createTeacherId, setCreateTeacherId] = useState<string | null>(null);

  const [extraDescription, setExtraDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");

  const [withholdingAmount, setWithholdingAmount] = useState("");

  const [paidOn, setPaidOn] = useState(todayInRome);
  const [paidMethod, setPaidMethod] = useState<PaidMethod>("bonifico");
  const [paidNote, setPaidNote] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLessonPayrolls(supabase, {
        year,
        month,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setRows(list);
    } catch (err: unknown) {
      setError(italianError(err, "Impossibile caricare le notule."));
    } finally {
      setLoading(false);
    }
  }, [month, statusFilter, supabase, year]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void Promise.all([
      listMembers(supabase),
      listMemberIdsWithRole(supabase, MemberRole.Docente),
    ])
      .then(([list, ids]) => {
        setMembers(list);
        setTeacherIds(new Set(ids));
      })
      .catch((err: unknown) => {
        setError(italianError(err, "Impossibile caricare i docenti."));
      });
  }, [supabase]);

  const teachers = useMemo(() => {
    const pool =
      teacherIds.size > 0
        ? members.filter((row) => teacherIds.has(row.id))
        : members;
    return pool.filter((row) => row.isActive);
  }, [members, teacherIds]);

  const teacherMatches = useMemo(() => {
    const term = teacherQuery.trim().toLowerCase();
    if (!term) return [];
    return teachers
      .filter((row) => {
        const hay =
          `${row.lastName} ${row.firstName} ${row.email ?? ""} ${row.memberNumber ?? ""}`.toLowerCase();
        return hay.includes(term);
      })
      .slice(0, 8);
  }, [teacherQuery, teachers]);

  const selectedTeacher = teachers.find((row) => row.id === createTeacherId);
  const signedVisible = useMemo(
    () => rows.filter((row) => row.status === "signed"),
    [rows],
  );

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  function closeAction() {
    setOpenAction(null);
    setExtraDescription("");
    setExtraAmount("");
    setWithholdingAmount("");
    setPaidOn(todayInRome());
    setPaidMethod("bonifico");
    setPaidNote("");
  }

  function openRowAction(row: LessonPayroll, kind: RowAction) {
    resetMessages();
    setExpandedId(row.id);
    setOpenAction({ id: row.id, kind });
    if (kind === "withholding") {
      setWithholdingAmount(String(row.withholdingEur).replace(".", ","));
    }
    if (kind === "paid") {
      setPaidOn(row.paidOn ?? todayInRome());
      setPaidMethod(
        row.paidMethod === "contanti" || row.paidMethod === "altro"
          ? row.paidMethod
          : "bonifico",
      );
      setPaidNote(row.paidNote ?? "");
    }
    if (kind === "extra") {
      setExtraDescription("");
      setExtraAmount("");
    }
  }

  async function handleCreateDraft() {
    if (!createTeacherId) {
      setError("Seleziona un docente.");
      return;
    }
    setCreating(true);
    resetMessages();
    const result = await generateLessonPayroll(supabase, {
      teacherMemberId: createTeacherId,
      year,
      month,
      actorMemberId,
    });
    setCreating(false);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile creare la bozza.");
      return;
    }
    const extra =
      result.warnings && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    setNotice(
      `Bozza creata per ${selectedTeacher ? memberLabel(selectedTeacher) : "il docente"} — ${monthLabel(year, month)}.${extra}`,
    );
    setCreateTeacherId(null);
    setTeacherQuery("");
    await loadRows();
  }

  async function handleGenerate(row: LessonPayroll) {
    setBusyId(row.id);
    resetMessages();
    const result = await generateLessonPayroll(supabase, {
      teacherMemberId: row.teacherMemberId,
      year: row.year,
      month: row.month,
      actorMemberId,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile generare la notula.");
      return;
    }
    const extra =
      result.warnings && result.warnings.length > 0
        ? ` ${result.warnings.join(" ")}`
        : "";
    setNotice(`Notula rigenerata per ${row.teacherLabel}.${extra}`);
    await loadRows();
  }

  async function handleClose(row: LessonPayroll) {
    setBusyId(row.id);
    resetMessages();
    const result = await closeLessonPayroll(supabase, {
      payrollId: row.id,
      actorMemberId,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile chiudere la notula.");
      return;
    }
    setNotice(`Notula di ${row.teacherLabel} chiusa.`);
    await loadRows();
  }

  async function handleCloseSigned() {
    if (signedVisible.length === 0) {
      setError("Nessuna notula firmata da chiudere in questo mese.");
      return;
    }
    setBulkBusy(true);
    resetMessages();
    const failures: string[] = [];
    let closed = 0;
    for (const row of signedVisible) {
      const result = await closeLessonPayroll(supabase, {
        payrollId: row.id,
        actorMemberId,
      });
      if (result.success) {
        closed += 1;
      } else {
        failures.push(
          `${row.teacherLabel}: ${result.errorMessage ?? "chiusura non riuscita."}`,
        );
      }
    }
    setBulkBusy(false);
    if (failures.length > 0) {
      setError(failures.join(" "));
    }
    if (closed > 0) {
      setNotice(
        closed === 1
          ? "Chiusa 1 notula firmata."
          : `Chiuse ${closed} notule firmate.`,
      );
    }
    await loadRows();
  }

  async function handleUnlock(row: LessonPayroll) {
    if (
      !window.confirm(
        `Sbloccare il mese di ${row.teacherLabel}? Firma e fattura caricata verranno cancellate e la notula verrà rigenerata.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    resetMessages();
    const result = await unlockLessonPayroll(supabase, {
      payrollId: row.id,
      actorMemberId,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile sbloccare la notula.");
      return;
    }
    setNotice(`Mese sbloccato e notula rigenerata per ${row.teacherLabel}.`);
    closeAction();
    await loadRows();
  }

  async function handleWithholding(row: LessonPayroll) {
    const amount = parseEuroAmount(withholdingAmount, { allowZero: true });
    if (amount == null || amount < 0) {
      setError("Inserisci una ritenuta in euro, zero compreso.");
      return;
    }
    setBusyId(row.id);
    resetMessages();
    const result = await setLessonPayrollWithholding(supabase, {
      payrollId: row.id,
      actorMemberId,
      withholdingEur: amount,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile aggiornare la ritenuta.");
      return;
    }
    setNotice(`Ritenuta aggiornata per ${row.teacherLabel}.`);
    closeAction();
    await loadRows();
  }

  async function handlePaid(row: LessonPayroll) {
    if (!paidOn) {
      setError("Inserisci la data di pagamento.");
      return;
    }
    setBusyId(row.id);
    resetMessages();
    const result = await markLessonPayrollPaid(supabase, {
      payrollId: row.id,
      actorMemberId,
      paidOn,
      paidMethod,
      paidNote: paidNote.trim() || undefined,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile registrare il pagamento.");
      return;
    }
    setNotice(`Pagamento registrato per ${row.teacherLabel}.`);
    closeAction();
    await loadRows();
  }

  async function handleExtra(row: LessonPayroll) {
    const amount = parseEuroAmount(extraAmount);
    if (!extraDescription.trim() || amount == null) {
      setError("Inserisci descrizione e importo dell’extra.");
      return;
    }
    setBusyId(row.id);
    resetMessages();
    const result = await addLessonPayrollExtra(supabase, {
      payrollId: row.id,
      actorMemberId,
      description: extraDescription.trim(),
      amountEur: amount,
    });
    setBusyId(null);
    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile aggiungere l’extra.");
      return;
    }
    setNotice(`Extra aggiunto alla notula di ${row.teacherLabel}.`);
    closeAction();
    await loadRows();
  }

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Notule"
        description="Compensi docenti mensili. Distinte dalle notule spese in Rimborsi."
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
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Anno</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={inputClass}
          >
            {yearOptions(initialMonth.year).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-600">Mese</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className={inputClass}
          >
            {MONTHS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
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
          onClick={() => void handleCloseSigned()}
          disabled={bulkBusy || signedVisible.length === 0}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          {bulkBusy ? "Chiusura…" : "Chiudi firmati del mese"}
        </button>
      </div>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Crea bozza
        </legend>
        <p className="text-sm text-neutral-600">
          Genera o rigenera la notula di un docente per {monthLabel(year, month)}.
          Serve se manca la riga in elenco.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-neutral-600">Docente</span>
            {selectedTeacher ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-800">
                  {memberLabel(selectedTeacher)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCreateTeacherId(null);
                    setTeacherQuery("");
                  }}
                  className="text-neutral-500 hover:text-neutral-900"
                  aria-label="Rimuovi docente"
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <input
                  type="search"
                  value={teacherQuery}
                  onChange={(e) => setTeacherQuery(e.target.value)}
                  placeholder="Cerca docente…"
                  className={inputClass}
                />
                {teacherQuery.trim() ? (
                  <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                    {teacherMatches.length === 0 ? (
                      <li className="px-3 py-2 text-neutral-500">
                        Nessun docente trovato.
                      </li>
                    ) : (
                      teacherMatches.map((member) => (
                        <li key={member.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCreateTeacherId(member.id);
                              setTeacherQuery("");
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
        </div>
        <button
          type="button"
          onClick={() => void handleCreateDraft()}
          disabled={creating}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {creating ? "Creazione…" : "Crea bozza"}
        </button>
      </fieldset>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Caricamento…
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessuna notula per {monthLabel(year, month)}. Cerca un docente e
            crea la bozza.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500">
                <th className="px-4 py-3 font-medium">Docente</th>
                <th className="px-4 py-3 font-medium">Mese</th>
                <th className="px-4 py-3 font-medium">Ore ins.</th>
                <th className="px-4 py-3 font-medium">Ore coord.</th>
                <th className="px-4 py-3 font-medium">Lordo</th>
                <th className="px-4 py-3 font-medium">Anticipi</th>
                <th className="px-4 py-3 font-medium">Riporto</th>
                <th className="px-4 py-3 font-medium">Ritenuta</th>
                <th className="px-4 py-3 font-medium">Netto</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Firmata / fattura</th>
                <th className="px-4 py-3 font-medium">Pagato</th>
                <th className="px-4 py-3 font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busyId === row.id;
                const expanded = expandedId === row.id;
                const action =
                  openAction?.id === row.id ? openAction.kind : null;
                return (
                  <FragmentRow
                    key={row.id}
                    row={row}
                    busy={busy}
                    expanded={expanded}
                    action={action}
                    extraDescription={extraDescription}
                    extraAmount={extraAmount}
                    withholdingAmount={withholdingAmount}
                    paidOn={paidOn}
                    paidMethod={paidMethod}
                    paidNote={paidNote}
                    onToggleExpand={() => {
                      setExpandedId(expanded ? null : row.id);
                      if (expanded) closeAction();
                    }}
                    onGenerate={() => void handleGenerate(row)}
                    onClose={() => void handleClose(row)}
                    onUnlock={() => void handleUnlock(row)}
                    onOpenWithholding={() => openRowAction(row, "withholding")}
                    onOpenPaid={() => openRowAction(row, "paid")}
                    onOpenExtra={() => openRowAction(row, "extra")}
                    onCancelAction={closeAction}
                    onExtraDescription={setExtraDescription}
                    onExtraAmount={setExtraAmount}
                    onWithholdingAmount={setWithholdingAmount}
                    onPaidOn={setPaidOn}
                    onPaidMethod={setPaidMethod}
                    onPaidNote={setPaidNote}
                    onSaveWithholding={() => void handleWithholding(row)}
                    onSavePaid={() => void handlePaid(row)}
                    onSaveExtra={() => void handleExtra(row)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  busy,
  expanded,
  action,
  extraDescription,
  extraAmount,
  withholdingAmount,
  paidOn,
  paidMethod,
  paidNote,
  onToggleExpand,
  onGenerate,
  onClose,
  onUnlock,
  onOpenWithholding,
  onOpenPaid,
  onOpenExtra,
  onCancelAction,
  onExtraDescription,
  onExtraAmount,
  onWithholdingAmount,
  onPaidOn,
  onPaidMethod,
  onPaidNote,
  onSaveWithholding,
  onSavePaid,
  onSaveExtra,
}: {
  row: LessonPayroll;
  busy: boolean;
  expanded: boolean;
  action: RowAction | null;
  extraDescription: string;
  extraAmount: string;
  withholdingAmount: string;
  paidOn: string;
  paidMethod: PaidMethod;
  paidNote: string;
  onToggleExpand: () => void;
  onGenerate: () => void;
  onClose: () => void;
  onUnlock: () => void;
  onOpenWithholding: () => void;
  onOpenPaid: () => void;
  onOpenExtra: () => void;
  onCancelAction: () => void;
  onExtraDescription: (value: string) => void;
  onExtraAmount: (value: string) => void;
  onWithholdingAmount: (value: string) => void;
  onPaidOn: (value: string) => void;
  onPaidMethod: (value: PaidMethod) => void;
  onPaidNote: (value: string) => void;
  onSaveWithholding: () => void;
  onSavePaid: () => void;
  onSaveExtra: () => void;
}) {
  return (
    <>
      <tr className="border-b border-neutral-100 align-top">
        <td className="px-4 py-3 font-medium text-neutral-900">
          {row.teacherLabel}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {monthLabel(row.year, row.month)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {formatHours(row.minutesTeaching)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {formatHours(row.minutesCoordination)}
        </td>
        <td className="px-4 py-3 text-neutral-900">
          {formatEuro(row.grossEur)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {formatEuro(row.advancesEur)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {formatEuro(row.carryInEur)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {formatEuro(row.withholdingEur)}
        </td>
        <td className="px-4 py-3 text-neutral-900">{formatEuro(row.netEur)}</td>
        <td className="px-4 py-3 text-neutral-700">
          {statusLabel(row.status)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {signedInvoiceLabel(row)}
        </td>
        <td className="px-4 py-3 text-neutral-700">
          {row.paidOn
            ? `${formatShortDate(row.paidOn)}${
                row.paidMethod ? ` · ${paidMethodLabel(row.paidMethod)}` : ""
              }`
            : "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggleExpand}
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              {expanded ? "Chiudi dettaglio" : "Apri dettaglio"}
            </button>
            <button
              type="button"
              onClick={() => {
                void generateLessonPayrollPdf(row).then(downloadLessonPayrollPdf);
              }}
              className="text-sm font-medium text-[var(--brand)] hover:underline"
            >
              PDF
            </button>
            {row.status === "draft" ? (
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
              >
                {busy ? "…" : "Genera/rigenera"}
              </button>
            ) : null}
            {row.status !== "closed" ? (
              <button
                type="button"
                onClick={onOpenWithholding}
                disabled={busy}
                className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
              >
                Ritenuta
              </button>
            ) : null}
            {row.status === "signed" ? (
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
              >
                Chiudi
              </button>
            ) : null}
            {row.status === "signed" || row.status === "closed" ? (
              <>
                <button
                  type="button"
                  onClick={onUnlock}
                  disabled={busy}
                  className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                >
                  Sblocca
                </button>
                <button
                  type="button"
                  onClick={onOpenPaid}
                  disabled={busy}
                  className="text-sm font-medium text-[var(--brand)] hover:underline disabled:opacity-50"
                >
                  Pagato
                </button>
              </>
            ) : null}
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-neutral-100 bg-neutral-50">
          <td colSpan={13} className="px-4 py-4">
            <div className="space-y-4">
              {row.lines.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Nessuna riga in questa notula.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-500">
                      <th className="py-1 pr-4 font-medium">Data</th>
                      <th className="py-1 pr-4 font-medium">Descrizione</th>
                      <th className="py-1 font-medium">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.lines.map((line, index) => (
                      <tr key={line.id ?? `${row.id}-${index}`}>
                        <td className="py-1 pr-4 text-neutral-700">
                          {line.occurredOn
                            ? formatShortDate(line.occurredOn)
                            : "—"}
                        </td>
                        <td className="py-1 pr-4 text-neutral-800">
                          {line.description}
                        </td>
                        <td className="py-1 text-neutral-900">
                          {formatEuro(line.amountEur)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {row.carryOutEur > 0 ? (
                <p className="text-xs text-neutral-500">
                  Riporto al mese successivo: {formatEuro(row.carryOutEur)}.
                </p>
              ) : null}

              {row.status === "draft" ? (
                <div>
                  {action === "extra" ? (
                    <div className="max-w-lg space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
                      <p className="text-xs text-neutral-600">
                        Extra (saggio, riunione). Resta dopo la rigenerazione.
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={extraDescription}
                          onChange={(e) => onExtraDescription(e.target.value)}
                          placeholder="Descrizione"
                          className={inputClass}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={extraAmount}
                          onChange={(e) => onExtraAmount(e.target.value)}
                          placeholder="Importo €"
                          className={inputClass}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={onSaveExtra}
                          disabled={busy}
                          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Aggiungi extra
                        </button>
                        <button
                          type="button"
                          onClick={onCancelAction}
                          className="text-xs text-neutral-600 hover:underline"
                        >
                          Annulla
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenExtra}
                      className="text-sm font-medium text-[var(--brand)] hover:underline"
                    >
                      Aggiungi extra
                    </button>
                  )}
                </div>
              ) : null}

              {action === "withholding" ? (
                <div className="max-w-xs space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-neutral-600">
                      Ritenuta €
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={withholdingAmount}
                      onChange={(e) => onWithholdingAmount(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onSaveWithholding}
                      disabled={busy}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Salva
                    </button>
                    <button
                      type="button"
                      onClick={onCancelAction}
                      className="text-xs text-neutral-600 hover:underline"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : null}

              {action === "paid" ? (
                <div className="max-w-lg space-y-2 rounded-lg border border-neutral-200 bg-white p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-neutral-600">Data</span>
                      <input
                        type="date"
                        value={paidOn}
                        onChange={(e) => onPaidOn(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-neutral-600">Metodo</span>
                      <select
                        value={paidMethod}
                        onChange={(e) =>
                          onPaidMethod(e.target.value as PaidMethod)
                        }
                        className={inputClass}
                      >
                        <option value="bonifico">Bonifico</option>
                        <option value="contanti">Contanti</option>
                        <option value="altro">Altro</option>
                      </select>
                    </label>
                    <label className="block text-sm sm:col-span-2">
                      <span className="mb-1 block text-neutral-600">Nota</span>
                      <input
                        value={paidNote}
                        onChange={(e) => onPaidNote(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onSavePaid}
                      disabled={busy}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Segna pagato
                    </button>
                    <button
                      type="button"
                      onClick={onCancelAction}
                      className="text-xs text-neutral-600 hover:underline"
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
