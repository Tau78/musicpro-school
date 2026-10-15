import Link from "next/link";

import type { CreditTransaction } from "@musicpro/database";

import {
  CREDIT_TRANSACTION_TYPE_LABELS,
  formatCreditAmount,
  formatCreditTransactionWhen,
} from "@/components/shop/credit-transaction-display";

interface CreditTransactionListProps {
  transactions: CreditTransaction[];
  bookingHref?: string;
}

export function CreditTransactionList({
  transactions,
  bookingHref = "/prenotazioni/mie",
}: CreditTransactionListProps) {
  if (transactions.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-neutral-500">
        Nessun movimento registrato.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-neutral-100 md:hidden">
        {transactions.map((tx) => (
          <li key={tx.id} className="px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-neutral-900">
                  {CREDIT_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatCreditTransactionWhen(tx.createdAt)}
                </p>
                {tx.reason ? (
                  <p className="mt-1 text-neutral-600">{tx.reason}</p>
                ) : null}
              </div>
              <p
                className={`shrink-0 font-semibold tabular-nums ${
                  tx.amount > 0
                    ? "text-green-700"
                    : tx.amount < 0
                      ? "text-red-700"
                      : "text-neutral-600"
                }`}
              >
                {formatCreditAmount(tx.amount)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium text-right">Importo</th>
              <th className="px-4 py-2 font-medium">Dettaglio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {transactions.map((tx) => (
              <tr key={tx.id} className="text-neutral-800">
                <td className="whitespace-nowrap px-4 py-2">
                  {formatCreditTransactionWhen(tx.createdAt)}
                </td>
                <td className="px-4 py-2">
                  {CREDIT_TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium tabular-nums ${
                    tx.amount > 0
                      ? "text-green-700"
                      : tx.amount < 0
                        ? "text-red-700"
                        : "text-neutral-600"
                  }`}
                >
                  {formatCreditAmount(tx.amount)}
                </td>
                <td className="max-w-md px-4 py-2">
                  {tx.reason ?? "—"}
                  {tx.bookingId ? (
                    <>
                      {" · "}
                      <Link
                        href={bookingHref}
                        className="text-[var(--brand)] hover:underline"
                      >
                        Prenotazione
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
