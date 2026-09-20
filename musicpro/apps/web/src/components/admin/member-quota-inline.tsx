"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
  buildMemberQuotaHistory,
  formatQuotaEuro,
  listMemberAnnualQuotas,
  upsertMemberAnnualQuotas,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString());
}

function draftsFromQuotas(
  quotas: MemberAnnualQuota[],
): Record<number, string> {
  const next: Record<number, string> = {};
  for (const quota of quotas) {
    next[quota.fiscalYear] = toDateInputValue(quota.paidAt);
  }
  return next;
}

interface MemberQuotaInlineProps {
  memberId: string;
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  enrolledAt: string | null;
}

export function MemberQuotaInline({
  memberId,
  quotas: initialQuotas,
  quotaSettings,
  enrolledAt,
}: MemberQuotaInlineProps) {
  const router = useRouter();
  const supabase = createClient();

  const [quotas, setQuotas] = useState(initialQuotas);
  const [draftDates, setDraftDates] = useState(() =>
    draftsFromQuotas(initialQuotas),
  );
  const [savingYear, setSavingYear] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setQuotas(initialQuotas);
    setDraftDates(draftsFromQuotas(initialQuotas));
  }, [initialQuotas]);

  const amountByYear = useMemo(() => {
    const map = new Map<number, number>();
    for (const setting of quotaSettings) {
      map.set(setting.fiscalYear, setting.amountEur);
    }
    return map;
  }, [quotaSettings]);

  const history = useMemo(
    () =>
      buildMemberQuotaHistory({
        quotas,
        enrolledAt,
        settings: quotaSettings,
      }),
    [quotas, enrolledAt, quotaSettings],
  );

  async function saveYear(fiscalYear: number) {
    const paidAt = (draftDates[fiscalYear] ?? "").trim() || todayInputValue();
    const existing = quotas.find((q) => q.fiscalYear === fiscalYear);
    const amount =
      existing?.amountPaidEur ??
      existing?.amountDueEur ??
      amountByYear.get(fiscalYear) ??
      null;

    if (amount == null) {
      setError(
        `Manca l'importo per il ${fiscalYear}. Impostalo in Quote → Importi.`,
      );
      setSuccess(null);
      return;
    }

    setSavingYear(fiscalYear);
    setError(null);
    setSuccess(null);

    const result = await upsertMemberAnnualQuotas(supabase, [
      {
        memberId,
        fiscalYear,
        paidAt,
        amountPaidEur: amount,
        amountDueEur: amount,
      },
    ]);

    if (!result.success) {
      setSavingYear(null);
      setError(result.errorMessage ?? "Impossibile salvare la quota.");
      return;
    }

    try {
      const refreshed = await listMemberAnnualQuotas(supabase, { memberId });
      setQuotas(refreshed);
      setDraftDates(draftsFromQuotas(refreshed));
      setSuccess(`Quota ${fiscalYear} registrata.`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Salvata, ma ricarica la pagina per aggiornare l'elenco.",
      );
    } finally {
      setSavingYear(null);
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-100 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-800">Quote annuali</p>
        <Link
          href="/admin/quote?sezione=pagamenti"
          className="text-xs font-medium text-[var(--brand)] hover:underline"
        >
          Gestisci in Quote
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-green-700">{success}</p>
      ) : null}

      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {history.map((row) => {
          const versata = row.status === "versata";
          const draft = draftDates[row.fiscalYear] ?? "";
          const busy = savingYear === row.fiscalYear;
          return (
            <li
              key={row.fiscalYear}
              className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className="font-medium text-neutral-900">
                  {row.fiscalYear}
                </span>
                <span
                  className={versata ? "text-green-700" : "text-amber-700"}
                >
                  {versata ? "versata" : "non versata"}
                </span>
                {row.amountEur != null ? (
                  <span className="text-neutral-500">
                    ({formatQuotaEuro(row.amountEur)})
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={draft}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftDates((prev) => ({
                      ...prev,
                      [row.fiscalYear]: value,
                    }));
                    setError(null);
                    setSuccess(null);
                  }}
                  disabled={busy}
                  aria-label={`Data versamento ${row.fiscalYear}`}
                  className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm text-neutral-800 disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveYear(row.fiscalYear)}
                  className="shrink-0 rounded-md bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
                >
                  {busy
                    ? "…"
                    : versata
                      ? "Aggiorna"
                      : "Registra"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        Senza data, Registra usa oggi. Le modifiche qui non passano da «Salva
        modifiche».
      </p>
    </div>
  );
}
