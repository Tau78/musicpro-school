"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { APP_NAME } from "@musicpro/shared";

import { BrandLogo } from "@/components/brand/brand-logo";

interface InviteAcceptPanelProps {
  token: string;
  bandName: string;
  inviteEmail: string;
  isLoggedIn: boolean;
}

function InviteAcceptPanel({
  token,
  bandName,
  inviteEmail,
  isLoggedIn,
}: InviteAcceptPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/band-invites/${token}`, {
        method: "POST",
      });

      const data = (await response.json()) as {
        success?: boolean;
        bandId?: string;
        message?: string;
      };

      if (!response.ok || !data.success || !data.bandId) {
        throw new Error(data.message ?? "Impossibile accettare l'invito.");
      }

      router.push(`/dashboard/band/${data.bandId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile accettare l'invito.",
      );
      setLoading(false);
    }
  }

  if (!isLoggedIn) {
    const signupHref = `/signup?redirect=${encodeURIComponent(`/invite/${token}`)}`;
    const loginHref = `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`;

    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--brand)]">
          Accedi per unirti
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Per entrare in <strong>{bandName}</strong> devi avere un account
          MusicPro collegato all&apos;email{" "}
          <span className="font-medium">{inviteEmail}</span>.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={signupHref}
            className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Registrati
          </Link>
          <Link
            href={loginHref}
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Accedi
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
      <h2 className="text-lg font-semibold text-[var(--brand)]">
        Unisciti a {bandName}
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Sei connesso. Clicca qui sotto per entrare nella band. Se non hai ancora
        completato iscrizione e quota, verrai guidato nel flusso onboarding.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={loading}
        onClick={() => void handleAccept()}
        className="mt-6 rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {loading ? "Accesso in corso…" : "Accetta invito"}
      </button>
    </div>
  );
}

interface InvitePageClientProps {
  token: string;
  bandName: string;
  inviteEmail: string;
  isLoggedIn: boolean;
  expired: boolean;
}

export function InvitePageClient({
  token,
  bandName,
  inviteEmail,
  isLoggedIn,
  expired,
}: InvitePageClientProps) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-[var(--brand)]/5 via-[var(--background)] to-[var(--background)]">
      <div className="mx-auto max-w-lg px-6 py-12">
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>

        <p className="text-center text-sm font-medium text-[var(--brand-accent)]">
          {APP_NAME}
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-[var(--brand)]">
          Invito band
        </h1>

        {expired ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
            <p className="font-medium">Invito non valido o scaduto</p>
            <p className="mt-2">
              Chiedi al founder della band di inviarti un nuovo link.
            </p>
            <Link
              href="/login"
              className="mt-4 inline-flex text-sm font-medium underline"
            >
              Vai al login
            </Link>
          </div>
        ) : (
          <div className="mt-8">
            <InviteAcceptPanel
              token={token}
              bandName={bandName}
              inviteEmail={inviteEmail}
              isLoggedIn={isLoggedIn}
            />
          </div>
        )}
      </div>
    </main>
  );
}
