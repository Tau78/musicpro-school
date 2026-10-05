"use client";

import { useEffect, useRef, useState } from "react";

import { emailDomainError } from "@musicpro/database";

export type CompanionDeclaration = "all_ok" | "need_quota";

type QuotaLookup = "idle" | "checking" | "ok" | "none";

type GuestRow = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  quota: QuotaLookup;
};

const inputClass =
  "min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm";

function emptyRow(): GuestRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    firstName: "",
    lastName: "",
    email: "",
    quota: "idle",
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
  const lookupSeq = useRef<Record<string, number>>({});
  const nameKey = rows
    .map((row) => `${row.key}:${row.firstName.trim()}:${row.lastName.trim()}`)
    .join("|");

  useEffect(() => {
    if (declaration !== "need_quota") return;

    const timers = rows.map((row) => {
      const first = row.firstName.trim();
      const last = row.lastName.trim();
      const seq = (lookupSeq.current[row.key] ?? 0) + 1;
      lookupSeq.current[row.key] = seq;

      if (!first || !last) {
        setRows((prev) =>
          prev.map((item) =>
            item.key === row.key && item.quota !== "idle"
              ? { ...item, quota: "idle" }
              : item,
          ),
        );
        return null;
      }

      setRows((prev) =>
        prev.map((item) =>
          item.key === row.key && item.quota !== "checking"
            ? { ...item, quota: "checking" }
            : item,
        ),
      );

      return window.setTimeout(() => {
        void fetch(
          `/api/prenotazioni/companion-invites?firstName=${encodeURIComponent(first)}&lastName=${encodeURIComponent(last)}`,
          { credentials: "same-origin" },
        )
          .then((res) => res.json())
          .then((payload: { quotaOk?: boolean }) => {
            if (lookupSeq.current[row.key] !== seq) return;
            setRows((prev) =>
              prev.map((item) =>
                item.key === row.key
                  ? { ...item, quota: payload.quotaOk ? "ok" : "none" }
                  : item,
              ),
            );
          })
          .catch(() => {
            if (lookupSeq.current[row.key] !== seq) return;
            setRows((prev) =>
              prev.map((item) =>
                item.key === row.key ? { ...item, quota: "none" } : item,
              ),
            );
          });
      }, 350);
    });

    return () => {
      for (const timer of timers) {
        if (timer != null) window.clearTimeout(timer);
      }
    };
    // nameKey copre le sole variazioni nome/cognome; quota non deve retriggerare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaration, nameKey]);

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
    const toSend = filled.filter((row) => row.quota !== "ok");
    const alreadyOk = filled.filter((row) => row.quota === "ok").length;

    const invalid = toSend.find(
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

    if (toSend.length === 0) {
      setSending(false);
      setSuccess(
        alreadyOk > 0
          ? alreadyOk === 1
            ? "Ok Quota: nessuna email inviata."
            : `Ok Quota per ${alreadyOk} persone: nessuna email inviata.`
          : "Compila almeno una riga.",
      );
      if (alreadyOk === 0) setError("Compila almeno una riga con nome, cognome e email.");
      return;
    }

    try {
      const res = await fetch("/api/prenotazioni/companion-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          guests: toSend.map((row) => ({
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
                disabled={row.quota === "ok"}
                className={`${inputClass} min-w-[10rem] sm:flex-[1.4] disabled:bg-neutral-50`}
              />
              {row.quota === "ok" ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                  <span aria-hidden>✓</span>
                  Ok Quota
                </span>
              ) : row.quota === "checking" ? (
                <span className="shrink-0 text-xs text-neutral-400">…</span>
              ) : null}
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
