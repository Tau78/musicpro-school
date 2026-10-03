"use client";

import { useState } from "react";

export function PinForm({ nextPath }: { nextPath: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/tabellone/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, next: nextPath }),
    });
    setPending(false);
    if (!response.ok) {
      setError("PIN non riconosciuto.");
      return;
    }
    window.location.assign(nextPath);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-black px-6 text-amber-100"
    >
      <p className="text-xs tracking-[0.35em] text-amber-400">TABELLONE</p>
      <input
        autoFocus
        aria-label="PIN"
        autoCapitalize="characters"
        autoComplete="off"
        value={pin}
        maxLength={12}
        onChange={(event) => setPin(event.target.value.toUpperCase())}
        className="w-full max-w-xs border border-amber-500/40 bg-black px-4 py-3 text-center font-mono text-3xl tracking-[0.35em] text-amber-50 outline-none"
      />
      <button
        type="submit"
        disabled={pending || pin.trim().length < 4}
        className="bg-amber-400 px-8 py-2 text-sm font-semibold tracking-wide text-black disabled:opacity-40"
      >
        Entra
      </button>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </form>
  );
}
