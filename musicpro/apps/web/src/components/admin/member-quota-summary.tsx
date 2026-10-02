"use client";

import { useMemo } from "react";

import {
  buildMemberQuotaHistory,
  currentFiscalYear,
  formatQuotaDateItalian,
  formatQuotaEuro,
  type AnnualQuotaSetting,
  type MemberAnnualQuota,
} from "@musicpro/database";

interface MemberQuotaSummaryProps {
  quotas: MemberAnnualQuota[];
  quotaSettings: AnnualQuotaSetting[];
  enrolledAt?: string | null;
  maxYears?: number;
  onManage?: () => void;
}

export function MemberQuotaSummary({
  quotas,
  quotaSettings,
  enrolledAt,
  maxYears = 5,
  onManage,
}: MemberQuotaSummaryProps) {
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
  const visible = history.slice(0, maxYears);
  const hiddenCount = Math.max(0, history.length - visible.length);
  const currentRow = history.find((row) => row.fiscalYear === currentYear);
  const paidCount = history.filter((row) => row.status === "versata").length;

  if (history.length === 0) {
    return (
      <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-xs font-medium text-neutral-800">
            Quote associative
          </p>
          {onManage ? (
            <button
              type="button"
              onClick={onManage}
              className="shrink-0 text-[11px] font-medium text-[var(--brand)] hover:underline"
            >
              Gestisci
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">
          Nessun anno da mostrare (manca data iscrizione o impostazioni quota).
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-snug text-neutral-800">
          Quote associative
          <span className="mt-0.5 block font-normal text-neutral-500 sm:ml-1.5 sm:mt-0 sm:inline">
            {paidCount}/{history.length} versate
          </span>
        </p>
        {onManage ? (
          <button
            type="button"
            onClick={onManage}
            className="shrink-0 pt-0.5 text-[11px] font-medium text-[var(--brand)] hover:underline"
          >
            Gestisci
          </button>
        ) : null}
      </div>

      {currentRow ? (
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

      <ul className="min-w-0 space-y-1.5">
        {visible.map((row) => {
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
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-[11px] sm:text-xs"
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
    </div>
  );
}
