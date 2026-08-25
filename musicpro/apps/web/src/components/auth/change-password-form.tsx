"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

function passwordUpdateMessage(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("same") || text.includes("should be different")) {
    return "La nuova password deve essere diversa da quella attuale.";
  }
  if (text.includes("leaked") || text.includes("pwned") || text.includes("data breach")) {
    return "Questa password risulta compromessa. Scegline un’altra.";
  }
  if (text.includes("weak") || text.includes("characters")) {
    return "La password è troppo debole. Usa almeno 8 caratteri.";
  }
  return message || "Impossibile aggiornare la password.";
}

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setOk(null);

    if (password.length < 8) {
      setError("La nuova password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(passwordUpdateMessage(updateError.message));
      return;
    }

    setPassword("");
    setConfirmPassword("");
    setOk("Password aggiornata.");
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-sm text-neutral-600">
        Sei già connesso: scegli la nuova password (almeno 8 caratteri). Non
        serve quella attuale.
      </p>
      <div>
        <label
          htmlFor="new-password"
          className="block text-sm font-medium text-neutral-700"
        >
          Nuova password
        </label>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label
          htmlFor="confirm-new-password"
          className="block text-sm font-medium text-neutral-700"
        >
          Conferma nuova password
        </label>
        <input
          id="confirm-new-password"
          name="confirm-new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className={inputClass}
        />
      </div>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {busy ? "Salvataggio…" : "Aggiorna password"}
      </button>
    </form>
  );
}
