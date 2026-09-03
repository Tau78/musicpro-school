"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { ensureMemberLinked } from "@musicpro/database";
import { mapAuthError, mapLoginQueryError } from "@musicpro/shared";

import { passkeyErrorMessage } from "@/lib/auth/passkey-errors";
import { authCallbackUrl } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "password" | "magic" | "passkey";

type AuthSignInPanelProps = {
  defaultRedirect?: string;
  title?: string;
  subtitle?: string;
  showSignupLink?: boolean;
};

const inputClass =
  "mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20";

export function AuthSignInPanel({
  defaultRedirect = "/dashboard",
  title = "Accedi al tuo account",
  subtitle = "Usa l'email registrata in anagrafica associati.",
  showSignupLink = true,
}: AuthSignInPanelProps) {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? defaultRedirect;
  const queryError = mapLoginQueryError(searchParams.get("error"));

  const [mode, setMode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const forgotHref = useMemo(() => {
    const params = new URLSearchParams({ redirect: redirectTo });
    return `/forgot-password?${params.toString()}`;
  }, [redirectTo]);

  const signupHref = useMemo(() => {
    const params = new URLSearchParams({ redirect: redirectTo });
    return `/signup?${params.toString()}`;
  }, [redirectTo]);

  useEffect(() => {
    if (queryError) {
      setError(queryError);
    }
  }, [queryError]);

  async function finishSignIn() {
    const supabase = createClient();
    const memberId = await ensureMemberLinked(supabase);

    if (!memberId) {
      setError(
        "Accesso riuscito, ma nessun profilo associato trovato per questa email. Contatta la segreteria.",
      );
      await supabase.auth.signOut();
      return;
    }

    // Ricarica completa: sincronizza cookie SSR e aggiorna UI (es. login inline su /prenotazioni)
    window.location.assign(redirectTo);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(mapAuthError(signInError.message));
        return;
      }

      await finishSignIn();
    } catch (err) {
      setError(
        err instanceof Error
          ? mapAuthError(err.message)
          : "Errore imprevisto durante l'accesso.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: authCallbackUrl(redirectTo),
        shouldCreateUser: false,
      },
    });

    setIsLoading(false);

    if (otpError) {
      setError(mapAuthError(otpError.message));
      return;
    }

    setMessage(
      "Ti abbiamo inviato un link di accesso. Controlla la posta (anche spam) e clicca entro pochi minuti.",
    );
  }

  async function handlePasskeySignIn() {
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const auth = supabase.auth as typeof supabase.auth & {
        signInWithPasskey?: () => Promise<{ error: Error | null }>;
      };
      if (!auth.signInWithPasskey) {
        setError("Passkey non disponibili in questa versione.");
        return;
      }
      const { error: passkeyError } = await auth.signInWithPasskey();
      if (passkeyError) {
        setError(passkeyErrorMessage(passkeyError));
        return;
      }
      await finishSignIn();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg shadow-[var(--brand)]/5 sm:p-8">
      <h2 className="text-xl font-semibold text-[var(--brand)]">{title}</h2>
      <p className="mt-2 text-sm text-neutral-600">{subtitle}</p>

      <div className="mt-6 flex rounded-lg bg-neutral-100 p-1 text-sm">
        {(
          [
            ["password", "Password"],
            ["magic", "Link email"],
            ["passkey", "Passkey"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 rounded-md px-2 py-2 font-medium transition ${
              mode === id
                ? "bg-white text-[var(--brand)] shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "password" ? (
        <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="auth-email"
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
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="auth-password" className="block text-sm font-medium text-neutral-700">
                Password
              </label>
              <Link
                href={forgotHref}
                className="text-xs font-medium text-[var(--brand)] underline-offset-2 hover:underline"
              >
                Password dimenticata?
              </Link>
            </div>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {isLoading ? "Accesso in corso…" : "Accedi"}
          </button>
        </form>
      ) : mode === "magic" ? (
        <form className="mt-6 space-y-4" onSubmit={handleMagicLinkSubmit}>
          <div>
            <label htmlFor="magic-email" className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@esempio.it"
              className={inputClass}
            />
            <p className="mt-2 text-xs text-neutral-500">
              Riceverai un link sicuro via email — nessuna password da ricordare.
            </p>
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
            className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {isLoading ? "Invio in corso…" : "Invia magic link"}
          </button>
        </form>
      ) : mode === "passkey" ? (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-neutral-600">
            Face ID, impronta o chiave del computer. La prima volta entra con la
            password e aggiungi la passkey dalla Dashboard.
          </p>
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void handlePasskeySignIn()}
            className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
          >
            {isLoading ? "Accesso in corso…" : "Accedi con passkey"}
          </button>
        </div>
      ) : null}

      {showSignupLink ? (
        <p className="mt-6 text-center text-sm text-neutral-600">
          Non hai un account?{" "}
          <Link
            href={signupHref}
            className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Registrati
          </Link>
        </p>
      ) : null}
    </div>
  );
}
