"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

interface MemberBandNameFormProps {
  initialName: string | null;
  canEdit: boolean;
  manageHref?: string;
}

export function MemberBandNameForm({
  initialName,
  canEdit,
  manageHref = "/dashboard/band",
}: MemberBandNameFormProps) {
  const [name, setName] = useState(initialName ?? "");
  const [savedName, setSavedName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/bands/my-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        name?: string;
        bookingsSynced?: number;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile salvare la band.");
      }

      setSavedName(data.name ?? name.trim());
      setName(data.name ?? name.trim());
      const synced = data.bookingsSynced ?? 0;
      setMessage(
        synced > 0
          ? `Band salvata. ${synced} prenotazioni aggiornate in calendario.`
          : "Band salvata.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile salvare la band.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (!canEdit && savedName) {
    return (
      <p className="mt-3 text-sm text-neutral-800">
        <span className="font-medium">{savedName}</span>
        <span className="text-neutral-500">
          {" "}
          — solo il founder può modificare il nome.{" "}
        </span>
        <Link
          href={manageHref}
          className="font-medium text-[var(--brand)] hover:underline"
        >
          Dettagli band
        </Link>
      </p>
    );
  }

  if (!canEdit) {
    return (
      <p className="mt-3 text-sm text-neutral-600">
        Se fai parte di una band, chiedi al founder di registrare il nome del
        gruppo oppure{" "}
        <Link
          href={manageHref}
          className="font-medium text-[var(--brand)] hover:underline"
        >
          crea la tua band
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="member-band-name"
          className="block text-sm font-medium text-neutral-800"
        >
          Nome band
        </label>
        <input
          id="member-band-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          maxLength={120}
          placeholder="Es. HellRaiser"
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading || name.trim().length < 2}
        className="btn-brand shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Salvataggio…" : savedName ? "Aggiorna" : "Salva"}
      </button>
      {error ? (
        <p className="text-sm text-red-700 sm:basis-full">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-800 sm:basis-full">{message}</p>
      ) : null}
    </form>
  );
}
