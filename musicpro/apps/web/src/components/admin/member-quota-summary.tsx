"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildMemberQuotaHistory,
  clearMemberAnnualQuota,
  currentFiscalYear,
  formatQuotaDateItalian,
  formatQuotaEuro,
  listMemberAnnualQuotas,
  upsertMemberAnnualQuotas,
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
  type MemberQuotaYearStatus,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

interface MemberQuotaSummaryProps {
  memberId?: string;
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  enrolledAt?: string | null;
  maxYears?: number;
  onQuotasChange?: (quotas: MemberAnnualQuota[]) => void;
}

type Draft = { paid: boolean; date: string };

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function draftsFromHistory(
  history: MemberQuotaYearStatus[],
): Record<number, Draft> {
  const next: Record<number, Draft> = {};
  for (const row of history) {
    next[row.fiscalYear] = {
      paid: row.status === "versata",
      date: toDateInput(row.paidAt),
    };
  }
  return next;
}

function draftsDiffer(
  history: MemberQuotaYearStatus[],
  drafts: Record<number, Draft>,
): boolean {
  return history.some((row) => {
    const draft = drafts[row.fiscalYear];
    if (!draft) return false;
    const paid = row.status === "versata";
    if (draft.paid !== paid) return true;
    if (draft.paid && draft.date !== toDateInput(row.paidAt)) return true;
    return false;
  });
}

export function MemberQuotaSummary({
  memberId,
  quotas: initialQuotas,
  quotaSettings,
  enrolledAt,
  maxYears = 5,
  onQuotasChange,
}: MemberQuotaSummaryProps) {
  const router = useRouter();
  const supabase = createClient();
  const [quotas, setQuotas] = useState(initialQuotas);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setQuotas(initialQuotas);
  }, [initialQuotas, editing]);

  const history = useMemo(
    () =>
      buildMemberQuotaHistory({
        quotas,
        settings: quotaSettings,
        enrolledAt,
      }),
    [quotas, quotaSettings, enrolledAt],
  );

  const currentYear = currentFiscalYear();
  const visible = editing ? history : history.slice(0, maxYears);
  const hiddenCount = editing ? 0 : Math.max(0, history.length - visible.length);
  const currentRow = history.find((row) => row.fiscalYear === currentYear);
  const paidCount = history.filter((row) => row.status === "versata").length;
  const dirty = editing && draftsDiffer(history, drafts);
  const canEdit = Boolean(memberId) && history.length > 0;

  function startEdit() {
    setDrafts(draftsFromHistory(history));
    setEditing(true);
    setError(null);
  }

  function stopEdit() {
    setEditing(false);
    setDrafts({});
    setError(null);
  }

  async function save() {
    if (!memberId || saving) return;
    setSaving(true);
    setError(null);

    const toUpsert: {
      memberId: string;
      fiscalYear: number;
      paidAt: string;
      amountPaidEur: number;
      amountDueEur: number;
      notes: string | null;
    }[] = [];
    const toClear: number[] = [];

    for (const row of history) {
      const draft = drafts[row.fiscalYear];
      if (!draft) continue;
      const wasPaid = row.status === "versata";
      const dateSame = draft.date === toDateInput(row.paidAt);
      if (draft.paid === wasPaid && (!draft.paid || dateSame)) continue;

      if (!draft.paid) {
        if (wasPaid) toClear.push(row.fiscalYear);
        continue;
      }

      const amount = row.amountEur;
      if (amount == null) {
        setSaving(false);
        setError(
          `Manca l'importo per il ${row.fiscalYear}. Impostalo in Quote → Importi.`,
        );
        return;
      }
      const existing = quotas.find((q) => q.fiscalYear === row.fiscalYear);
      toUpsert.push({
        memberId,
        fiscalYear: row.fiscalYear,
        paidAt: draft.date || todayInput(),
        amountPaidEur: amount,
        amountDueEur: amount,
        notes: existing?.notes ?? null,
      });
    }

    for (const year of toClear) {
      const result = await clearMemberAnnualQuota(supabase, memberId, year);
      if (!result.success) {
        setSaving(false);
        setError(result.errorMessage ?? "Impossibile annullare il versamento.");
        return;
      }
    }

    if (toUpsert.length) {
      const result = await upsertMemberAnnualQuotas(supabase, toUpsert);
      if (!result.success) {
        setSaving(false);
        setError(result.errorMessage ?? "Impossibile salvare le quote.");
        return;
      }
    }

    try {
      const refreshed = await listMemberAnnualQuotas(supabase, { memberId });
      setQuotas(refreshed);
      onQuotasChange?.(refreshed);
      setEditing(false);
      setDrafts({});
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Salvate, ma ricarica per vedere l'elenco aggiornato.",
      );
    } finally {
      setSaving(false);
    }
  }

  function onToolClick() {
    if (dirty) {
      void save();
      return;
    }
    if (editing) stopEdit();
    else startEdit();
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-snug text-neutral-800">
          Quote associative
          {history.length > 0 ? (
            <span className="mt-0.5 block font-normal text-neutral-500 sm:ml-1.5 sm:mt-0 sm:inline">
              {paidCount}/{history.length} versate
            </span>
          ) : null}
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={onToolClick}
            disabled={saving}
            aria-label={dirty ? "Salva quote" : editing ? "Chiudi modifica quote" : "Modifica quote"}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${
              dirty
                ? "bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90"
                : "text-[var(--brand)] hover:bg-white"
            } disabled:opacity-50`}
          >
            {dirty ? <SaveIcon /> : <PencilIcon />}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-1 text-[11px] text-red-700">{error}</p> : null}

      {history.length === 0 ? (
        <p className="text-[11px] text-neutral-500">
          Nessun anno da mostrare (manca data iscrizione o impostazioni quota).
        </p>
      ) : (
        <>
          {!editing && currentRow ? (
            <p
              className={`mb-1.5 break-words text-[11px] font-medium leading-snug ${
                currentRow.status === "versata"
                  ? "text-green-700"
                  : "text-amber-800"
              }`}
            >
              {currentYear}:{" "}
              {currentRow.status === "versata" && currentRow.paidAt
                ? `versata il ${formatQuotaDateItalian(currentRow.paidAt)}`
                : `da versare${
                    currentRow.amountEur != null
                      ? ` · ${formatQuotaEuro(currentRow.amountEur)}`
                      : ""
                  }`}
            </p>
          ) : null}

          <ul className="min-w-0 space-y-1">
            {visible.map((row) => {
              const draft = drafts[row.fiscalYear];
              if (editing && draft) {
                return (
                  <li
                    key={row.fiscalYear}
                    className="flex min-w-0 items-center gap-2 text-[11px] sm:text-xs"
                  >
                    <span className="w-10 shrink-0 font-medium tabular-nums text-neutral-800">
                      {row.fiscalYear}
                    </span>
                    <label className="inline-flex shrink-0 items-center gap-1 text-neutral-700">
                      <input
                        type="checkbox"
                        checked={draft.paid}
                        onChange={(e) => {
                          const paid = e.target.checked;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.fiscalYear]: {
                              paid,
                              date:
                                paid && !prev[row.fiscalYear]?.date
                                  ? todayInput()
                                  : prev[row.fiscalYear]?.date ?? "",
                            },
                          }));
                        }}
                      />
                      Versata
                    </label>
                    {draft.paid ? (
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => {
                          const date = e.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [row.fiscalYear]: { paid: true, date },
                          }));
                        }}
                        aria-label={`Data versamento ${row.fiscalYear}`}
                        className="h-7 min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1 text-[11px] text-neutral-800"
                      />
                    ) : (
                      <span className="min-w-0 flex-1 text-right text-amber-800">
                        Da versare
                        {row.amountEur != null
                          ? ` · ${formatQuotaEuro(row.amountEur)}`
                          : ""}
                      </span>
                    )}
                  </li>
                );
              }

              const versata = row.status === "versata";
              const detail =
                versata && row.paidAt
                  ? `Versata · ${formatQuotaDateItalian(row.paidAt)}`
                  : `Da versare${
                      row.amountEur != null
                        ? ` · ${formatQuotaEuro(row.amountEur)}`
                        : ""
                    }`;
              return (
                <li
                  key={row.fiscalYear}
                  className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 text-[11px] sm:text-xs"
                >
                  <span className="font-medium tabular-nums text-neutral-800">
                    {row.fiscalYear}
                  </span>
                  <span
                    className={`min-w-0 break-words text-right leading-snug ${
                      versata ? "text-green-700" : "text-amber-800"
                    }`}
                  >
                    {detail}
                  </span>
                </li>
              );
            })}
          </ul>

          {hiddenCount > 0 ? (
            <p className="mt-1 text-[10px] text-neutral-500">
              +{hiddenCount} ann{hiddenCount === 1 ? "o" : "i"} precedenti
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M9.5 2.5 13.5 6.5 5 15H1v-4L9.5 2.5Z" strokeLinejoin="round" />
      <path d="M8 4 12 8" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 8.5 6.2 12 13 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
