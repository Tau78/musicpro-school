"use client";

import { useEffect, useMemo, useState } from "react";

import {
  listMembers,
  recordManualCreditPurchase,
  type MemberSummary,
} from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

function todayRomeIsoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const controlClass =
  "min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50";

const dateClass = `w-full ${controlClass}`;

function parseNonNegative(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

function parsePositive(raw: string): number | null {
  const value = parseNonNegative(raw);
  if (value == null || value <= 0) return null;
  return value;
}

function memberOptionLabel(member: MemberSummary): string {
  const name = `${member.lastName} ${member.firstName}`.trim();
  return member.memberNumber != null ? `${name} (#${member.memberNumber})` : name;
}

function emailFailureNotice(message: string): string {
  const detail = message.trim() || "errore sconosciuto";
  return `Crediti caricati. Email non inviata: ${detail}`;
}

async function emailCreditPurchase(purchaseId: string): Promise<string> {
  try {
    const response = await fetch("/api/shop/receipts/from-purchase", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ purchaseId }),
    });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
    } | null;
    if (response.ok && body?.success) return "Crediti caricati.";
    return emailFailureNotice(body?.message ?? "errore sconosciuto");
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : "errore sconosciuto";
    return emailFailureNotice(detail);
  }
}

export function ManualCreditLoadForm({
  onLoaded,
}: {
  onLoaded: () => void | Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [paidOn, setPaidOn] = useState(todayRomeIsoDate);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberId, setMemberId] = useState("");
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"contanti" | "bonifico">("contanti");
  const [credits, setCredits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listMembers(supabase)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMembersError(
            err instanceof Error
              ? err.message
              : "Impossibile caricare gli associati.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const visibleMembers = useMemo(() => {
    const term = memberQuery.trim().toLowerCase();
    const matched = term
      ? members.filter((member) => {
          const hay =
            `${member.lastName} ${member.firstName} ${member.email ?? ""} ${member.memberNumber ?? ""}`.toLowerCase();
          return hay.includes(term);
        })
      : members;
    if (memberId && !matched.some((member) => member.id === memberId)) {
      const selected = members.find((member) => member.id === memberId);
      if (selected) return [selected, ...matched];
    }
    return matched;
  }, [memberId, memberQuery, members]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId) {
      setError("Seleziona un associato.");
      setNotice(null);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      setError("Inserisci la data di pagamento.");
      setNotice(null);
      return;
    }
    const amountEur = parseNonNegative(amount);
    const creditsGranted = parsePositive(credits);
    if (amountEur == null) {
      setError("L'importo non può essere negativo.");
      setNotice(null);
      return;
    }
    if (creditsGranted == null) {
      setError("I crediti devono essere maggiori di zero.");
      setNotice(null);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      let recorded: Awaited<ReturnType<typeof recordManualCreditPurchase>>;
      try {
        recorded = await recordManualCreditPurchase(supabase, {
          memberId,
          paidOn,
          amountEur,
          method,
          credits: creditsGranted,
        });
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Impossibile caricare i crediti.",
        );
        return;
      }

      if (!recorded.success) {
        setError(recorded.errorMessage ?? "Impossibile caricare i crediti.");
        return;
      }

      let nextNotice = "Crediti caricati.";
      if (recorded.purchaseId) {
        nextNotice = await emailCreditPurchase(recorded.purchaseId);
      }

      setAmount("");
      setCredits("");
      setNotice(nextNotice);
      await onLoaded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="min-w-0 max-w-full space-y-2"
    >
      <p className="text-sm font-medium text-neutral-800">Carico manuale</p>
      {membersError ? (
        <p className="text-sm text-red-700">{membersError}</p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-green-800">{notice}</p> : null}
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <label className="grid min-w-0 max-w-full flex-[1_1_11rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 text-sm text-neutral-700 sm:w-52 sm:flex-none">
          <span>Data</span>
          <input
            type="date"
            required
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
            aria-label="Data pagamento"
            className={`${dateClass} w-full min-w-0 max-w-full`}
          />
        </label>
        <input
          type="search"
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          placeholder="Cerca associato"
          aria-label="Cerca associato"
          className={`${controlClass} flex-[1_1_9rem] sm:w-40 sm:flex-none`}
        />
        <select
          required
          value={memberId}
          onChange={(event) => setMemberId(event.target.value)}
          aria-label="Associato"
          className={`${controlClass} flex-[1_1_12rem] sm:w-52 sm:flex-none`}
        >
          <option value="">Associato</option>
          {visibleMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {memberOptionLabel(member)}
            </option>
          ))}
        </select>
        <label className="grid min-w-0 max-w-full flex-[1_1_7rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 text-sm text-neutral-700 sm:w-32 sm:flex-none">
          <span>€</span>
          <input
            type="number"
            inputMode="decimal"
            required
            min={0}
            step={0.01}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Importo in euro"
            placeholder="0,00"
            className={dateClass}
          />
        </label>
        <select
          value={method}
          onChange={(event) =>
            setMethod(event.target.value as "contanti" | "bonifico")
          }
          aria-label="Metodo"
          className={`${controlClass} flex-[1_1_8rem] sm:w-36 sm:flex-none`}
        >
          <option value="contanti">Contanti</option>
          <option value="bonifico">Bonifico</option>
        </select>
        <label className="grid min-w-0 max-w-full flex-[1_1_8rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 text-sm text-neutral-700 sm:w-36 sm:flex-none">
          <span>Crediti</span>
          <input
            type="number"
            inputMode="decimal"
            required
            min={0.01}
            step={0.01}
            value={credits}
            onChange={(event) => setCredits(event.target.value)}
            aria-label="Crediti"
            className={dateClass}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="btn-brand rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
        >
          {busy ? "Carica…" : "Carica"}
        </button>
      </div>
    </form>
  );
}
