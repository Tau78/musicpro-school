"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { ensureMemberLinked } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setIsLoading(false);
      return;
    }

    const memberId = await ensureMemberLinked(supabase);

    if (!memberId) {
      setError(
        "Accesso riuscito, ma nessun profilo associato trovato per questa email. Contatta la segreteria.",
      );
      await supabase.auth.signOut();
      setIsLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-[var(--brand-accent)]">
        {APP_NAME}
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--brand)]">Accedi</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Pannello amministrativo — email e password Supabase.
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {isLoading ? "Accesso in corso…" : "Accedi"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        Non hai un account?{" "}
        <Link href="/signup" className="font-medium text-[var(--brand)] underline">
          Registrati
        </Link>
      </p>
    </div>
  );
}
