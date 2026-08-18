"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { reviewLessonChangeRequest } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";

interface ChangeRequestActionsProps {
  requestId: string;
  actorMemberId: string;
}

export function ChangeRequestActions({
  requestId,
  actorMemberId,
}: ChangeRequestActionsProps) {
  const router = useRouter();
  const supabase = createClient();

  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(approve: boolean) {
    setBusy(approve ? "approve" : "reject");
    setError(null);

    const result = await reviewLessonChangeRequest(supabase, requestId, {
      approve,
      actorMemberId,
    });
    setBusy(null);

    if (!result.success) {
      setError(result.errorMessage ?? "Operazione non riuscita.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void run(true)}
          className={`${buttonClass} bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90`}
        >
          {busy === "approve" ? "Approvo…" : "Approva"}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void run(false)}
          className={`${buttonClass} border border-red-200 bg-white text-red-700 hover:bg-red-50`}
        >
          {busy === "reject" ? "Rifiuto…" : "Rifiuta"}
        </button>
      </div>
    </div>
  );
}
