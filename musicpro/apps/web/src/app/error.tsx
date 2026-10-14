"use client";

/** Segment error boundary: non sostituisce il layout (a differenza di global-error). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">
        Qualcosa non ha funzionato
      </h1>
      <p className="mt-2 max-w-md text-sm text-neutral-600">
        Si è verificato un problema imprevisto.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[11px] text-neutral-400">
          {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="btn-brand mt-6 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
      >
        Riprova
      </button>
    </main>
  );
}
