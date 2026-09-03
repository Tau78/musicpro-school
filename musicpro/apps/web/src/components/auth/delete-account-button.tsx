"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { deactivateOwnAccount } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export function DeleteAccountButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const ok = window.confirm(
      "Disattivare l'account? Non potrai più accedere all'app. L'anagrafica resta in segreteria, che potrà riattivarti.",
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const result = await deactivateOwnAccount(supabase);
    setBusy(false);

    if (!result.success) {
      setError(result.errorMessage ?? "Operazione non riuscita.");
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mt-6 border-t border-neutral-100 pt-5">
      <h3 className="text-sm font-medium text-red-800">Elimina account</h3>
      <p className="mt-2 text-sm text-neutral-600">
        Disattiva l&apos;accesso all&apos;app. I dati anagrafici dell&apos;associato
        restano in segreteria e possono essere riattivati manualmente.
      </p>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="mt-3 rounded-lg bg-red-800 px-4 py-2 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-60"
      >
        {busy ? "Disattivazione…" : "Elimina account (disattiva)"}
      </button>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
