"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateOwnProfile } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export function MailingOptInToggle({
  memberId,
  initialOptIn,
}: {
  memberId: string;
  initialOptIn: boolean;
}) {
  const router = useRouter();
  const [optIn, setOptIn] = useState(initialOptIn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !optIn;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const result = await updateOwnProfile(supabase, memberId, {
      mailingOptIn: next,
    });
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Aggiornamento non riuscito.");
      return;
    }

    setOptIn(next);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-800">
            Comunicazioni della scuola
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Ricevi avvisi e mailing da MusicPro School (orari, eventi,
            comunicazioni organizzative).
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          aria-label="Ricevi comunicazioni della scuola"
          disabled={busy}
          onClick={() => void handleToggle()}
          className={`relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            optIn ? "bg-[var(--brand)]" : "bg-neutral-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              optIn ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
