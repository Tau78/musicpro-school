"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { mapPasswordUpdateError } from "@musicpro/shared";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!cancelled) {
        setSessionReady(Boolean(user));
        setCheckingSession(false);
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setIsLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (updateError) {
      setError(mapPasswordUpdateError(updateError.message));
      return;
    }

    router.push("/prenotazioni");
    router.refresh();
  }

  if (checkingSession) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
        Verifica link in corso…
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg">
        <BrandLogo href="/prenotazioni" size="sm" showSubtitle={false} />
        <h1 className="mt-6 text-xl font-semibold text-[var(--brand)]">Link non valido</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Il link di recupero è scaduto o è già stato usato. Richiedine uno nuovo.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
        >
          Richiedi nuovo link
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-[var(--brand)]/5">
      <BrandLogo href="/prenotazioni" size="sm" showSubtitle={false} />
      <h1 className="mt-6 text-2xl font-semibold text-[var(--brand)]">
        Nuova password
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Scegli una password sicura di almeno 8 caratteri.
      </p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
            Nuova password
          </label>
          <input
            id="password"
            name="password"
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
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-neutral-700"
          >
            Conferma password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
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

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
        >
          {isLoading ? "Salvataggio…" : "Salva password"}
        </button>
      </form>
    </div>
  );
}
