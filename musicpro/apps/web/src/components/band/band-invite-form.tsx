"use client";

import { FormEvent, useState } from "react";

interface BandInviteFormProps {
  bandId: string;
}

export function BandInviteForm({ bandId }: BandInviteFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInviteUrl(null);

    try {
      const response = await fetch(`/api/bands/${bandId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        inviteUrl?: string;
        message?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.message ?? "Impossibile creare l'invito.");
      }

      setInviteUrl(data.inviteUrl ?? null);
      setEmail("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossibile creare l'invito.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-xl border border-neutral-200 bg-white p-6"
    >
      <h2 className="text-lg font-medium text-[var(--brand)]">
        Invita un membro
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        Inserisci l&apos;email dell&apos;associato da invitare. Verrà generato
        un link monouso valido 14 giorni.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {inviteUrl ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-medium">Link invito creato</p>
          <p className="mt-2 break-all font-mono text-xs">{inviteUrl}</p>
          <button
            type="button"
            onClick={() => void copyInviteUrl()}
            className="mt-3 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-medium text-green-900 hover:bg-green-50"
          >
            Copia link
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <label
          htmlFor="invite-email"
          className="block text-sm font-medium text-[var(--brand)]"
        >
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          placeholder="nome@esempio.it"
          className="mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {loading ? "Generazione…" : "Genera link invito"}
      </button>
    </form>
  );
}
