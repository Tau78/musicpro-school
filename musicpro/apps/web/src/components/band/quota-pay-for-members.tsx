"use client";

import { useMemo, useState } from "react";

import { formatQuotaEuro } from "@musicpro/database";

export interface BandMemberQuotaOption {
  memberId: string;
  displayName: string;
  email?: string | null;
  quotaAmountEur: number;
}

interface QuotaPayForMembersProps {
  bandId: string;
  fiscalYear: number;
  members: BandMemberQuotaOption[];
}

export function QuotaPayForMembers({
  bandId,
  fiscalYear,
  members,
}: QuotaPayForMembersProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(
    members.map((member) => member.memberId),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalEur = useMemo(() => {
    const selected = new Set(selectedIds);
    return members
      .filter((member) => selected.has(member.memberId))
      .reduce((sum, member) => sum + member.quotaAmountEur, 0);
  }, [members, selectedIds]);

  function toggleMember(memberId: string) {
    setSelectedIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function handlePay() {
    if (selectedIds.length === 0) {
      setError("Seleziona almeno un membro.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/quota-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: selectedIds,
          bandId,
          fiscalYear,
        }),
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
      setLoading(false);
    }
  }

  if (members.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-lg font-medium text-[var(--brand)]">
        Paga quota per i membri
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Seleziona i membri della band senza quota {fiscalYear} e paga con un
        unico checkout Stripe.
      </p>

      <ul className="mt-4 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {members.map((member) => {
          const checked = selectedIds.includes(member.memberId);

          return (
            <li key={member.memberId} className="flex items-start gap-3 px-4 py-3">
              <input
                id={`quota-member-${member.memberId}`}
                type="checkbox"
                checked={checked}
                onChange={() => toggleMember(member.memberId)}
                className="mt-1 h-4 w-4 rounded border-neutral-300 text-[var(--brand)]"
              />
              <label
                htmlFor={`quota-member-${member.memberId}`}
                className="min-w-0 flex-1 cursor-pointer"
              >
                <span className="block font-medium text-neutral-900">
                  {member.displayName}
                </span>
                {member.email ? (
                  <span className="block text-sm text-neutral-500">
                    {member.email}
                  </span>
                ) : null}
                <span className="mt-1 block text-sm text-neutral-600">
                  {formatQuotaEuro(member.quotaAmountEur)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-700">
          Totale selezionato:{" "}
          <span className="font-semibold">{formatQuotaEuro(totalEur)}</span>
        </p>
        <button
          type="button"
          disabled={loading || selectedIds.length === 0}
          onClick={() => void handlePay()}
          className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
        >
          {loading ? "Reindirizzamento…" : "Paga quote selezionate"}
        </button>
      </div>
    </div>
  );
}
