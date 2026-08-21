"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
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
    if (password === currentPassword) {
      setError("La nuova password deve essere diversa da quella attuale.");
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const email = user?.email?.trim();
    if (!email) {
      setBusy(false);
      setError("Account senza email: non è possibile cambiare la password da qui.");
      return;
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (verifyError) {
      setBusy(false);
      setError("Password attuale non corretta.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (updateError) {
      setError(updateError.message || "Impossibile aggiornare la password.");
      return;
    }

    setCurrentPassword("");
    setPassword("");
    setConfirmPassword("");
    setOk("Password aggiornata.");
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-sm text-neutral-600">
        Cambia la password di accesso. Deve avere almeno 8 caratteri.
      </p>
      <div>
        <label
          htmlFor="current-password"
          className="block text-sm font-medium text-neutral-700"
        >
          Password attuale
        </label>
        <input
          id="current-password"
          name="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className={inputClass}
        />
      </div>
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
