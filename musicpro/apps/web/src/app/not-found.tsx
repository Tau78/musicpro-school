import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-semibold text-[var(--brand)]">
        Pagina non trovata
      </h1>
      <p className="mt-2 text-neutral-600">La pagina richiesta non esiste.</p>
      <Link
        href="/login"
        className="mt-6 text-sm text-[var(--brand)] underline"
      >
        Torna al login
      </Link>
    </main>
  );
}
