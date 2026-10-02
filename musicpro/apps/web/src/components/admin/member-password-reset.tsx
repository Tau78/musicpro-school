"use client";

import { useState } from "react";

interface MemberPasswordResetProps {
  memberId: string;
  memberEmail: string | null;
  memberFirstName: string;
}

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

/**
 * Override password associato (admin/segreteria) + email con la nuova password.
 * Non mostra la password attuale.
 */
export function MemberPasswordReset({
  memberId,
  memberEmail,
  memberFirstName,
}: MemberPasswordResetProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const emailOk = Boolean(memberEmail?.trim());

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setError("Le password non coincidono.");
      return;
    }
    if (!emailOk) {
      setError("Manca l'email sull'anagrafica.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/members/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          memberId,
          password,
          email: memberEmail?.trim() || undefined,
          notifyEmail: true,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        emailSent?: boolean;
        passwordUpdated?: boolean;
      };

      if (!response.ok || !payload.success) {
        setError(
          payload.message ??
            "Operazione non riuscita. Se la password è stata aggiornata ma l'email no, comunicala a mano all'associato.",
        );
        // Auth può essere ok anche se l'email di notifica fallisce (502).
        if (payload.passwordUpdated) {
          setSuccess(
            "Password aggiornata su Auth; ricarica la scheda. Controlla il messaggio errore sotto.",
          );
        }
        return;
      }

      setSuccess(payload.message ?? "Password aggiornata.");
      setPassword("");
      setConfirm("");
    } catch {
      setError("Impossibile aggiornare la password. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4 sm:p-6">
      <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
        Accesso / password
      </legend>
      <p className="text-xs text-neutral-600">
        Imposta la password di login su{" "}
        <span className="font-medium">school.musicproeventi.it</span>
        {emailOk ? (
          <>
            {" "}
            e invia un&apos;email con la nuova password a{" "}
            <span className="font-medium break-all">{memberEmail}</span>
            . Se l&apos;email nel form non è ancora salvata, viene scritta in
            anagrafica insieme all&apos;accesso Auth
          </>
        ) : (
          " · manca l'email nel form: compilala sopra (anche senza Salva) oppure Salva prima l'anagrafica"
        )}
        . Non è il link Stripe della quota (sezione Quote sopra).
      </p>

      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : null}
      {success ? (
        <p className="text-sm text-green-700">{success}</p>
      ) : null}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <label className="min-w-0 flex-1 text-sm sm:max-w-[11rem]">
          <span className="mb-1 block text-neutral-600">Nuova password</span>
          <input
            type="text"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            disabled={busy || !emailOk}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50"
            placeholder="min. 8 caratteri"
          />
        </label>
        <label className="min-w-0 flex-1 text-sm sm:max-w-[11rem]">
          <span className="mb-1 block text-neutral-600">Conferma</span>
          <input
            type="text"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
              setSuccess(null);
            }}
            disabled={busy || !emailOk}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={busy || !emailOk}
          onClick={() => {
            const next = generatePassword();
            setPassword(next);
            setConfirm(next);
            setError(null);
            setSuccess(null);
          }}
          className="min-h-10 shrink-0 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Genera
        </button>
        <button
          type="submit"
          disabled={busy || !emailOk}
          className="min-h-10 shrink-0 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
          title={
            emailOk
              ? `Imposta password e invia email a ${memberEmail}`
              : "Salva prima un'email sull'anagrafica"
          }
        >
          {busy ? "Invio…" : "Imposta e invia email"}
        </button>
      </form>
      <p className="text-xs text-neutral-500">
        Testo email: «l&apos;amministrazione ha resettato la tua password… ecco
        la nuova» (+ link di accesso)
        {memberFirstName ? ` · saluto a ${memberFirstName}` : ""}.
      </p>
    </fieldset>
  );
}
