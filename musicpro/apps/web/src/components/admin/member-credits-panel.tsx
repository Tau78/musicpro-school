"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  type CreditTransaction,
  type CreditTransactionType,
  type MemberCreditBalance,
  adminAdjustMemberCredits,
  formatDateItalian,
  getMemberCreditBalance,
  listMemberCreditTransactions,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const TRANSACTION_TYPE_LABELS: Record<CreditTransactionType, string> = {
  purchase: "Acquisto",
  debit: "Addebito",
  hold: "Blocco",
  release: "Rilascio",
  refund: "Rimborso",
  adjustment: "Rettifica admin",
  penalty: "Penale",
};

interface MemberCreditsPanelProps {
  memberId: string;
  initialBalance: MemberCreditBalance;
  initialTransactions: CreditTransaction[];
}

function formatCredits(amount: number): string {
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${amount}`;
}

function formatDateTime(iso: string): string {
  const date = formatDateItalian(iso);
  const time = new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

export function MemberCreditsPanel({
  memberId,
  initialBalance,
  initialTransactions,
}: MemberCreditsPanelProps) {
  const router = useRouter();
  const supabase = createClient();

  const [balance, setBalance] = useState(initialBalance);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function reloadCredits() {
    setRefreshing(true);
    setError(null);

    try {
      const [nextBalance, nextTransactions] = await Promise.all([
        getMemberCreditBalance(supabase, memberId),
        listMemberCreditTransactions(supabase, memberId),
      ]);
      setBalance(nextBalance);
      setTransactions(nextTransactions);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Errore nel caricamento dei crediti.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount === 0) {
      setError("Inserisci un importo diverso da zero.");
      setSaving(false);
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Il motivo è obbligatorio.");
      setSaving(false);
      return;
    }

    const result = await adminAdjustMemberCredits(
      supabase,
      memberId,
      amount,
      trimmedReason,
    );

    setSaving(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile aggiornare i crediti.");
      return;
    }

    if (result.balance) {
      setBalance(result.balance);
    }

    setAmountInput("");
    setReason("");
    setSuccess("Crediti aggiornati.");

    await reloadCredits();
    router.refresh();
  }

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-[var(--brand)]">
          Crediti sala
        </h3>
        <p className="mt-1 text-sm text-neutral-600">
          Saldo e movimenti del wallet crediti per le prenotazioni.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <BalanceCard
          label="Disponibili"
          value={balance.available}
          highlight
        />
        <BalanceCard label="Bloccati" value={balance.held} />
        <BalanceCard label="Totale" value={balance.total} />
      </div>

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Rettifica manuale
        </legend>
        <form onSubmit={(e) => void handleAdjust(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">
                Importo (positivo = accredito, negativo = addebito)
              </span>
              <input
                type="number"
                step="1"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="es. 5 o -2"
                className={inputClass}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-neutral-600">Motivo *</span>
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="es. Accredito promozionale"
                className={inputClass}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--brand)] px-6 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Applica rettifica"}
          </button>
        </form>
      </fieldset>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h4 className="text-sm font-semibold text-neutral-900">
            Storico movimenti
          </h4>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void reloadCredits()}
            className="text-sm text-[var(--brand)] hover:underline disabled:opacity-50"
          >
            {refreshing ? "Aggiornamento…" : "Aggiorna"}
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">
            Nessun movimento registrato.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-neutral-600">
                  <th className="px-4 py-2 font-medium">Data</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium text-right">Importo</th>
                  <th className="px-4 py-2 font-medium">Motivo</th>
                  <th className="px-4 py-2 font-medium">Prenotazione</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="text-neutral-800">
                    <td className="whitespace-nowrap px-4 py-2">
                      {formatDateTime(tx.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      {TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type}
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
                      {formatCredits(tx.amount)}
                    </td>
                    <td className="max-w-xs truncate px-4 py-2">
                      {tx.reason ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {tx.bookingId ? (
                        <Link
                          href="/admin/prenotazioni"
                          className="text-[var(--brand)] hover:underline"
                          title={tx.bookingId}
                        >
                          Vedi prenotazioni
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function BalanceCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        highlight
          ? "border-[var(--brand)]/30 bg-[var(--brand)]/5"
          : "border-neutral-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight ? "text-[var(--brand)]" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]";
