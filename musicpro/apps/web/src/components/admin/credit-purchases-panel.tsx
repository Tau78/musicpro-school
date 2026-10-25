"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  formatEuro,
  listAdminCreditPurchases,
  type AdminCreditPurchase,
} from "@musicpro/database";

import { ManualCreditLoadForm } from "@/components/admin/manual-credit-load-form";
import { createClient } from "@/lib/supabase/client";

/** Campi manuali: se il tipo condiviso non è ancora allineato, restano opzionali qui. */
type HistoryPurchase = AdminCreditPurchase & {
  packageId?: string | null;
  paymentMethod?: "contanti" | "bonifico" | "nexi" | null;
  paidOn?: string | null;
};

const fieldClass =
  "min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";

function formatPurchaseDate(paidOn: string | null | undefined, createdAt: string): string {
  if (paidOn && /^\d{4}-\d{2}-\d{2}/.test(paidOn)) {
    const [year, month, day] = paidOn.slice(0, 10).split("-");
    if (year && month && day) return `${day}/${month}/${year}`;
  }
  return new Date(createdAt).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function packageLabel(row: HistoryPurchase): string {
  if (!row.packageId) return "Caricamento manuale";
  return row.package?.name ?? "Pacchetto";
}

function paymentMethodLabel(method: HistoryPurchase["paymentMethod"]): string {
  if (method === "contanti") return "Contanti";
  if (method === "bonifico") return "Bonifico";
  if (method === "nexi") return "Carta";
  return "—";
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    maximumFractionDigits: 2,
  }).format(value);
}

export function CreditPurchasesPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<HistoryPurchase[]>([]);
  const [search, setSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listAdminCreditPurchases(supabase)
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare lo storico.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, supabase]);

  const associates = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; lastName: string; firstName: string }
    >();
    for (const row of rows) {
      if (!row.member) continue;
      byId.set(row.member.id, {
        id: row.member.id,
        lastName: row.member.lastName,
        firstName: row.member.firstName,
      });
    }
    return [...byId.values()].sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, "it", { sensitivity: "base" }) ||
        a.firstName.localeCompare(b.firstName, "it", { sensitivity: "base" }),
    );
  }, [rows]);

  const term = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (memberFilter && row.memberId !== memberFilter) return false;
    if (!term) return true;
    const hay = [
      packageLabel(row),
      row.member?.email,
      row.member?.firstName,
      row.member?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(term);
  });

  return (
    <div className="min-w-0 max-w-full space-y-3">
      <ManualCreditLoadForm onLoaded={reload} />
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <label className="flex min-w-0 max-w-full flex-[1_1_14rem] items-center gap-2 text-sm text-neutral-700">
          <span>Associato</span>
          <select
            value={memberFilter}
            onChange={(event) => setMemberFilter(event.target.value)}
            aria-label="Filtra per associato"
            className={`${fieldClass} min-w-0 w-full max-w-full flex-1`}
          >
            <option value="">Tutti</option>
            {associates.map((member) => (
              <option key={member.id} value={member.id}>
                {member.lastName} {member.firstName}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cerca per prodotto o associato…"
          aria-label="Cerca nello storico"
          className={`${fieldClass} w-full min-w-0 max-w-full flex-[1_1_12rem] sm:max-w-sm`}
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-neutral-500">
        {loading ? "Caricamento…" : `${filtered.length} acquisti`}
      </p>
      <div className="min-w-0 max-w-full overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Associato</th>
              <th className="px-4 py-3 font-medium">Pacchetto</th>
              <th className="px-4 py-3 font-medium">Metodo</th>
              <th className="px-4 py-3 font-medium">Importo</th>
              <th className="px-4 py-3 font-medium">Crediti</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  {loading ? "Caricamento…" : "Nessun acquisto."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatPurchaseDate(row.paidOn, row.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {row.member
                      ? `${row.member.lastName} ${row.member.firstName}`
                      : "—"}
                    {row.member?.email ? (
                      <span className="block text-xs text-neutral-400">
                        {row.member.email}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {packageLabel(row)}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    {paymentMethodLabel(row.paymentMethod)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(row.amountPaidEur)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {formatCredits(row.creditsGranted)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
