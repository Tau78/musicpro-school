"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface BandLeaveButtonProps {
  bandId: string;
  bandName: string;
}

export function BandLeaveButton({ bandId, bandName }: BandLeaveButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLeave() {
    const confirmed = window.confirm(
      `Vuoi abbandonare la band "${bandName}"?`,
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/bands/${bandId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile abbandonare la band.");
      }

      router.push("/dashboard/band");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile abbandonare la band.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={loading}
        onClick={() => void handleLeave()}
        className="rounded-lg border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {loading ? "Uscita…" : "Abbandona band"}
      </button>
    </div>
  );
}
