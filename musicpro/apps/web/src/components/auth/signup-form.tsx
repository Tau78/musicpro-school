"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";

import { ensureMemberLinked } from "@musicpro/database";
import { mapAuthError } from "@musicpro/shared";

import { authCallbackUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

export function SignupForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const loginHref = useMemo(() => {
    const params = new URLSearchParams({ redirect: redirectTo });
    return `/login?${params.toString()}`;
  }, [redirectTo]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authCallbackUrl(redirectTo),
        },
      });

      if (signUpError) {
        setError(mapAuthError(signUpError.message));
        return;
      }

      if (data.session) {
        const memberId = await ensureMemberLinked(supabase);

        if (!memberId) {
          setError(
            "Registrazione riuscita, ma nessun profilo associato trovato per questa email. Contatta la segreteria per collegare il tuo account.",
          );
          await supabase.auth.signOut();
          return;
        }

        window.location.assign(redirectTo);
        return;
      }

      setMessage(
        "Controlla la tua email per confermare l'account, poi accedi con la password scelta.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? mapAuthError(err.message)
          : "Errore imprevisto durante la registrazione.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-[var(--brand)]/5">
      <BrandLogo href="/prenotazioni" size="sm" showSubtitle={false} />
      <h1 className="mt-6 text-2xl font-semibold text-[var(--brand)]">
        Registrati
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Usa la stessa email presente nell&apos;anagrafica associati.
      </p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-700"
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome@esempio.it"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-neutral-700"
          >
            Password
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
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
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
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {isLoading ? "Registrazione in corso…" : "Crea account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        Hai già un account?{" "}
        <Link
          href={loginHref}
          className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
        >
          Accedi
        </Link>
      </p>
    </div>
  );
}
