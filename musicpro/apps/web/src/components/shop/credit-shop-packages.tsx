"use client";

import { useState } from "react";

import { formatEuro, type CreditPackage } from "@musicpro/database";

interface CreditShopPackagesProps {
  packages: CreditPackage[];
}

export function CreditShopPackages({ packages }: CreditShopPackagesProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePurchase(packageId: string) {
    setLoadingId(packageId);
    setError(null);

    try {
      const response = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        url?: string;
        message?: string;
      };

      if (!response.ok || !data.success || !data.url) {
        throw new Error(data.message ?? "Impossibile avviare il pagamento.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile avviare il pagamento.",
      );
      setLoadingId(null);
    }
  }

  if (packages.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
        Nessun pacchetto crediti disponibile al momento.
      </p>
    );
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map((pkg) => {
          const isLoading = loadingId === pkg.id;

          return (
            <li
              key={pkg.id}
              className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-[var(--brand)]">
                {pkg.name}
              </h3>
              {pkg.description ? (
                <p className="mt-2 text-sm text-neutral-600">{pkg.description}</p>
              ) : null}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-neutral-500">Crediti</dt>
                  <dd className="font-medium text-neutral-900">{pkg.credits}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-neutral-500">Prezzo</dt>
                  <dd className="font-medium text-neutral-900">
                    {formatEuro(pkg.priceEur)}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                disabled={isLoading || loadingId !== null}
                onClick={() => handlePurchase(pkg.id)}
                className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? "Reindirizzamento…" : "Acquista"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
