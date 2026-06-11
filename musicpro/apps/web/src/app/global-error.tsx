"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="it">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center p-6">
          <h1 className="text-2xl font-semibold">Errore del server</h1>
          <p className="mt-2 text-neutral-600">
            Si è verificato un problema imprevisto.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm text-white"
          >
            Riprova
          </button>
        </main>
      </body>
    </html>
  );
}
