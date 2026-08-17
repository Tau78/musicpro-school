"use client";

import { useState } from "react";

interface QuotaPayButtonProps {
  disabled?: boolean;
}

export function QuotaPayButton({ disabled = false }: QuotaPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/onboarding/quota", {
        method: "POST",
      });

      const data = (await response.json()) as {
        success?: boolean;
        url?: string;
        message?: string;
      };

      if (!response.ok || !data.success || !data.url) {
        throw new Error(data.message ?? "Impossibile avviare il pagamento.");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile avviare il pagamento.",
      );
      setLoading(false);
    }
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void handlePay()}
        className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {loading ? "Reindirizzamento…" : "Paga quota associativa"}
      </button>
    </div>
  );
}
