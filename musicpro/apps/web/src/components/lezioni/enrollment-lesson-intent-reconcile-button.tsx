"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { reconcileEnrollmentLessonIntent } from "@musicpro/database";

import { createClient } from "@/lib/supabase/client";

export function EnrollmentLessonIntentReconcileButton({
  intentId,
  actorMemberId,
}: {
  intentId: string;
  actorMemberId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onReconcile() {
    setBusy(true);
    setError(null);
    const result = await reconcileEnrollmentLessonIntent(
      supabase,
      intentId,
      actorMemberId,
    );
    setBusy(false);
    if (!result.success) {
      setError(result.errorMessage || "Operazione non riuscita.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col items-stretch gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void onReconcile()}
        className="btn-brand inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-50"
      >
        {busy ? "In corso…" : "Crea corso e collega pagamento"}
      </button>
      {error ? (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
