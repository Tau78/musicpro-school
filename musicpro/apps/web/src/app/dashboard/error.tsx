"use client";

/** Evita che un throw SSR in dashboard salga a global-error (schermo bianco iOS). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-[var(--brand)]">
        Qualcosa non ha funzionato
      </h1>
      <p className="mt-2 max-w-md text-sm text-neutral-600">
        Non è stato possibile caricare la dashboard. Riprova tra poco.
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
