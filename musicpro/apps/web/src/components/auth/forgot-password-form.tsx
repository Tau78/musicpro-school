"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { mapAuthError } from "@musicpro/shared";
import { authCallbackUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams({ redirect: redirectTo });
    return `/login?${params.toString()}`;
  }, [redirectTo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: authCallbackUrl("/reset-password"),
      },
    );

    setIsLoading(false);

    if (resetError) {
      setError(mapAuthError(resetError.message));
      return;
    }

    setMessage(
      "Se l'email è registrata, riceverai un link per reimpostare la password. Controlla anche la cartella spam.",
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-[var(--brand)]/5">
      <BrandLogo href="/prenotazioni" size="sm" showSubtitle={false} />
      <h1 className="mt-6 text-2xl font-semibold text-[var(--brand)]">
        Recupera password
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        Inserisci l&apos;email del tuo account: ti invieremo un link per scegliere
        una nuova password.
      </p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
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
            className={inputClass}
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
        >
          {isLoading ? "Invio in corso…" : "Invia link di recupero"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        <Link href={loginHref} className="font-medium text-[var(--brand)] underline-offset-2 hover:underline">
          Torna al login
        </Link>
      </p>
    </div>
  );
}
