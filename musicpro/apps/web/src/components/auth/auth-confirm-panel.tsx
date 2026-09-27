"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

import { BrandLogo } from "@/components/brand/brand-logo";
import { mapAuthError } from "@musicpro/shared";
import { safeAuthNextPath } from "@/lib/auth/redirect-url";
import { createClient } from "@/lib/supabase/client";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function parseOtpType(raw: string | null): EmailOtpType | null {
  if (!raw) return null;
  return OTP_TYPES.has(raw as EmailOtpType) ? (raw as EmailOtpType) : null;
}

function copyForType(type: EmailOtpType | null): {
  title: string;
  body: string;
  cta: string;
} {
  if (type === "recovery") {
    return {
      title: "Imposta la password",
      body: "Conferma per aprire la pagina e scegliere una nuova password. Il link funziona una sola volta.",
      cta: "Continua",
    };
  }
  if (type === "magiclink" || type === "email") {
    return {
      title: "Accedi a MusicPro School",
      body: "Conferma per completare l’accesso con il link ricevuto via email.",
      cta: "Accedi",
    };
  }
  return {
    title: "Conferma l’accesso",
    body: "Conferma per continuare. Il link funziona una sola volta.",
    cta: "Continua",
  };
}

export function AuthConfirmPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));
  const nextPath = safeAuthNextPath(
    searchParams.get("next"),
    type === "recovery" ? "/reset-password" : "/dashboard",
  );
  const copy = useMemo(() => copyForType(type), [type]);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const linkMissing = !tokenHash || !type;

  async function handleConfirm() {
    if (!tokenHash || !type) {
      setError("Link di accesso non valido o scaduto. Richiedine uno nuovo.");
      return;
    }

    setError(null);
    setIsLoading(true);

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (verifyError) {
      setIsLoading(false);
      setError(
        mapAuthError(verifyError.message) ||
          "Link di accesso non valido o scaduto. Richiedine uno nuovo.",
      );
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg shadow-[var(--brand)]/5">
      <BrandLogo href="/prenotazioni" size="sm" showSubtitle={false} />
      <h1 className="mt-6 text-2xl font-semibold text-[var(--brand)]">
        {copy.title}
      </h1>
      <p className="mt-2 text-sm text-neutral-600">{copy.body}</p>

      {linkMissing ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Link di accesso non valido o scaduto. Richiedine uno nuovo.
        </p>
      ) : null}

      {error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!linkMissing ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleConfirm()}
          className="mt-8 w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--brand)]/90 disabled:opacity-60"
        >
          {isLoading ? "Verifica in corso…" : copy.cta}
        </button>
      ) : null}

      <p className="mt-6 text-center text-sm text-neutral-600">
        <Link
          href="/login"
          className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
        >
          Torna al login
        </Link>
        {" · "}
        <Link
          href="/forgot-password"
          className="font-medium text-[var(--brand)] underline-offset-2 hover:underline"
        >
          Nuovo link
        </Link>
      </p>
    </div>
  );
}
