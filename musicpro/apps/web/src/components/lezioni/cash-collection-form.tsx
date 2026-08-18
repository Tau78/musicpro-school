"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  registerTeacherCashCollection,
  todayInRome,
} from "@musicpro/database";

import { issueAndEmailReceiptCopy } from "@/lib/lezioni/issue-receipt-copy";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:bg-neutral-50 disabled:text-neutral-500";

function parseEuroAmount(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

export function CashCollectionForm({
  enrollmentId,
  actorMemberId,
  studentLabel,
}: {
  enrollmentId: string;
  actorMemberId: string;
  studentLabel?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayInRome);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountEur = parseEuroAmount(amount);
    if (amountEur == null) {
      setError("Inserisci un importo in euro maggiore di zero.");
      setNotice(null);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const result = await registerTeacherCashCollection(supabase, {
      enrollmentId,
      amountEur,
      paidOn,
      note: note.trim() || undefined,
      actorMemberId,
    });

    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Impossibile registrare i contanti.");
      return;
    }

    setAmount("");
    setPaidOn(todayInRome());
    setNote("");

    let extra = "";
    if (result.id) {
      try {
        const emailed = await issueAndEmailReceiptCopy(
          supabase,
          result.id,
          actorMemberId,
        );
        if (!emailed.success) {
          extra =
            emailed.errorMessage ??
            "Ricevuta da inviare dalla scheda Ricevute.";
        }
      } catch {
        extra = "Ricevuta da inviare dalla scheda Ricevute.";
      }
    }

    setNotice(
      studentLabel
        ? `Contanti registrati per ${studentLabel}. I crediti sono già accreditati.${extra ? ` ${extra}` : ""}`
        : `Contanti registrati. I crediti sono già accreditati.${extra ? ` ${extra}` : ""}`,
    );
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <fieldset className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Contanti docente
        </legend>
        <p className="text-sm text-neutral-600">
          {studentLabel
            ? `Registra un incasso in contanti per ${studentLabel}. I crediti lezione salgono subito; l’anticipo va in coda per lo staff.`
            : "Registra un incasso in contanti. I crediti lezione salgono subito; l’anticipo va in coda per lo staff."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Importo €</span>
            <input
              required
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Data</span>
            <input
              required
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-neutral-600">Nota</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Opzionale"
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {busy ? "Registrazione…" : "Registra contanti"}
      </button>
    </form>
  );
}
