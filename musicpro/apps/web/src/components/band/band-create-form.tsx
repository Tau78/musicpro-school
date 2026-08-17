"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function BandCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/bands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        id?: string;
        message?: string;
      };

      if (!response.ok || !data.success || !data.id) {
        throw new Error(data.message ?? "Impossibile creare la band.");
      }

      router.push(`/dashboard/band/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile creare la band.",
      );
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-xl border border-neutral-200 bg-white p-6"
    >
      <h2 className="text-lg font-medium text-[var(--brand)]">
        Crea una nuova band
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Scegli un nome per il tuo gruppo. Diventerai il founder e potrai
        invitare altri associati.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <label
          htmlFor="band-name"
          className="block text-sm font-medium text-[var(--brand)]"
        >
          Nome band
        </label>
        <input
          id="band-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={120}
          placeholder="Es. The Rolling Stones Tribute"
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading || name.trim().length < 2}
        className="mt-4 rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {loading ? "Creazione…" : "Crea band"}
      </button>
    </form>
  );
}
