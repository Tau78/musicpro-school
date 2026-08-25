"use client";

import { useEffect, useState } from "react";

import {
  formatEuro,
  listAdminCreditPurchases,
  type AdminCreditPurchase,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CreditPurchasesPanel() {
  const [rows, setRows] = useState<AdminCreditPurchase[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAdminCreditPurchases(createClient())
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((err) => {
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
  }, []);

  const term = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!term) return true;
    const hay = [
      row.package?.name,
      row.member?.email,
      row.member?.firstName,
      row.member?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(term);
  });

  if (loading) {
    return <p className="text-sm text-neutral-500">Caricamento…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cerca per prodotto o associato…"
        className="w-full max-w-sm rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]"
      />
      <p className="text-sm text-neutral-500">
        {filtered.length} acquisti
      </p>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Prodotto</th>
              <th className="px-4 py-3 font-medium">Associato</th>
              <th className="px-4 py-3 font-medium">Prezzo</th>
              <th className="px-4 py-3 font-medium">Crediti</th>
              <th className="px-4 py-3 font-medium">Stato</th>
              <th className="px-4 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Nessun acquisto.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {row.package?.name ?? "Pacchetto"}
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
                  <td className="px-4 py-3 tabular-nums">
                    {formatEuro(row.amountPaidEur)}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.creditsGranted}</td>
                  <td className="px-4 py-3">{row.paymentStatus}</td>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatWhen(row.createdAt)}
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
