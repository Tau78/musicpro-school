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
        quotaSettings,
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
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-neutral-800">
            Quote associative
          </p>
          {onManage ? (
            <button
              type="button"
              onClick={onManage}
              className="text-[11px] font-medium text-[var(--brand)] hover:underline"
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
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-800">
          Quote associative
          <span className="ml-1.5 font-normal text-neutral-500">
            {paidCount}/{history.length} versate
          </span>
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

      {currentRow ? (
        <p
          className={`mb-1.5 text-[11px] font-medium ${
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

      <ul className="space-y-1">
        {visible.map((row) => {
          const versata = row.status === "versata";
          return (
            <li
              key={row.fiscalYear}
              className="flex items-baseline justify-between gap-2 text-[11px] sm:text-xs"
            >
              <span className="font-medium tabular-nums text-neutral-800">
                {row.fiscalYear}
              </span>
              <span
                className={`min-w-0 truncate text-right ${
                  versata ? "text-green-700" : "text-amber-800"
                }`}
              >
                {versata && row.paidAt
                  ? `Versata · ${formatQuotaDateItalian(row.paidAt)}`
                  : `Da versare${
                      row.amountEur != null
                        ? ` · ${formatQuotaEuro(row.amountEur)}`
                        : ""
                    }`}
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
