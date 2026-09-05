"use client";

import { useState } from "react";

import {
  FieldLabel,
  settingsInputClass,
} from "@/components/admin/settings-chrome";

type ResultState = {
  link: string;
  emailSent: boolean;
} | null;

export function CashEnrollmentCard() {
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/admin/iscrizione-contanti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cognome, email }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        link?: string;
        emailSent?: boolean;
      };

      if (!res.ok || !data.success || !data.link) {
        setError(data.message || "Operazione non riuscita.");
        return;
      }

      setResult({
        link: data.link,
        emailSent: Boolean(data.emailSent),
      });
      setNome("");
      setCognome("");
      setEmail("");
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!result?.link) return;
    try {
      await navigator.clipboard.writeText(result.link);
      setCopied(true);
    } catch {
      setError("Impossibile copiare il link.");
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-[var(--brand)]">
          Iscrizione quota in contanti
        </h3>
        <p className="mt-0.5 text-sm text-neutral-600">
          Nome, cognome ed email: registra la quota anno in corso e invia il
          link precompilato (valido 24 ore).
        </p>
      </div>

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid gap-3 sm:grid-cols-4 sm:items-end"
      >
        <div>
          <FieldLabel>Nome</FieldLabel>
          <input
            className={settingsInputClass}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="given-name"
            required
            disabled={busy}
          />
        </div>
        <div>
          <FieldLabel>Cognome</FieldLabel>
          <input
            className={settingsInputClass}
            value={cognome}
            onChange={(e) => setCognome(e.target.value)}
            autoComplete="family-name"
            required
            disabled={busy}
          />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            className={settingsInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={busy}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Invio…" : "Invia link iscrizione"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p>
            {result.emailSent
              ? "Email inviata. Puoi anche copiare il link:"
              : "Email non inviata (controlla Resend). Copia il link e invialo a mano:"}
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 break-all rounded bg-white/80 px-2 py-1 text-xs text-neutral-800">
              {result.link}
            </code>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex shrink-0 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
            >
              {copied ? "Copiato" : "Copia link"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
