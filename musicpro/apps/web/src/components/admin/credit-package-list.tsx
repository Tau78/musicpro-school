"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatEuro, type CreditPackage } from "@musicpro/database";

interface CreditPackageListProps {
  packages: CreditPackage[];
  canAdd: boolean;
}

export function CreditPackageList({ packages, canAdd }: CreditPackageListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return packages;

    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(term) ||
        (pkg.description?.toLowerCase().includes(term) ?? false),
    );
  }, [packages, search]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nome o descrizione…"
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] sm:max-w-sm"
        />
        {canAdd ? (
          <Link
            href="/admin/shop/nuovo"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Nuovo pacchetto
          </Link>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-neutral-500">
        {filtered.length} pacchett{filtered.length === 1 ? "o" : "i"}
      </p>

      <ul className="mt-4 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessun pacchetto trovato.
          </li>
        ) : (
          filtered.map((pkg) => (
            <li key={pkg.id}>
              <Link
                href={`/admin/shop/${pkg.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-sm font-semibold text-[var(--brand)]">
                  {pkg.credits}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-neutral-900">
                    {pkg.name}
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {pkg.description ?? `${pkg.credits} crediti`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium text-neutral-900">
                    {formatEuro(pkg.priceEur)}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {pkg.enabled ? "Attivo" : "Disattivato"}
                  </p>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
