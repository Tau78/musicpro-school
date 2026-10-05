"use client";

import { useState } from "react";

import { emailDomainError } from "@musicpro/database";

export type CompanionDeclaration = "all_ok" | "need_quota";

type GuestRow = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
};

const inputClass =
  "min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm";

function emptyRow(): GuestRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    firstName: "",
    lastName: "",
    email: "",
  };
}

export function BookingCompanionInvite({
  hidden,
  declaration,
  onDeclarationChange,
  inviteIds,
  onInviteIds,
}: {
  hidden: boolean;
  declaration: CompanionDeclaration;
  onDeclarationChange: (value: CompanionDeclaration) => void;
  inviteIds: string[];
  onInviteIds: (ids: string[]) => void;
}) {
  const [rows, setRows] = useState<GuestRow[]>([emptyRow()]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (hidden) return null;

  function updateRow(key: string, patch: Partial<GuestRow>) {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    setSuccess(null);

    const filled = rows.filter(
      (row) => row.firstName.trim() || row.lastName.trim() || row.email.trim(),
    );
    const invalid = filled.find(
      (row) =>
        !row.firstName.trim() ||
        !row.lastName.trim() ||
        emailDomainError(row.email),
    );
    if (invalid) {
      setSending(false);
      setError(
        emailDomainError(invalid.email) ??
          "Nome, cognome e email sono obbligatori su ogni riga compilata.",
      );
      return;
    }

    try {
      const res = await fetch("/api/prenotazioni/companion-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          guests: filled.map((row) => ({
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
          })),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        results?: Array<{ inviteId?: string }>;
      };
      if (!res.ok || payload.success === false) {
        setError(payload.message ?? "Invio non riuscito.");
        return;
      }
      const ids = (payload.results ?? [])
        .map((row) => row.inviteId)
        .filter((id): id is string => Boolean(id));
      onInviteIds([...inviteIds, ...ids]);
      setSuccess(payload.message ?? "Email inviate.");
    } catch {
      setError("Invio non riuscito.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-neutral-100 pt-3">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-neutral-800">
          Chi entra in struttura
        </legend>
        <label className="flex items-start gap-2 text-sm text-neutral-800">
          <input
            type="radio"
            name="companion-declaration"
            checked={declaration === "all_ok"}
            onChange={() => onDeclarationChange("all_ok")}
            className="mt-0.5"
          />
          <span>
            Sono al corrente che tutti quelli che farò entrare nella struttura
            assieme a me debbano essere iscritti ed in regola con la Quota
            Associativa.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-neutral-800">
          <input
            type="radio"
            name="companion-declaration"
            checked={declaration === "need_quota"}
            onChange={() => onDeclarationChange("need_quota")}
            className="mt-0.5"
          />
          <span>
            Uno o più di quelli che farò entrare con me devono iscriversi o
            versare la quota associativa.
          </span>
        </label>
      </fieldset>

      {declaration === "need_quota" && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-1.5"
            >
              <input
                type="text"
                value={row.firstName}
                onChange={(e) => updateRow(row.key, { firstName: e.target.value })}
                placeholder="Nome"
                autoComplete="given-name"
                className={inputClass}
              />
              <input
                type="text"
                value={row.lastName}
                onChange={(e) => updateRow(row.key, { lastName: e.target.value })}
                placeholder="Cognome"
                autoComplete="family-name"
                className={inputClass}
              />
              <input
                type="email"
                value={row.email}
                onChange={(e) => updateRow(row.key, { email: e.target.value })}
                placeholder="Email"
                autoComplete="email"
                className={`${inputClass} min-w-[10rem] sm:flex-[1.4]`}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              +
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
            >
              {sending ? "Invio…" : "Invia"}
            </button>
            <p className="text-xs text-neutral-500">
              La prenotazione procede anche senza invio.
            </p>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {success && <p className="text-xs text-green-700">{success}</p>}
        </div>
      )}
    </div>
  );
}
