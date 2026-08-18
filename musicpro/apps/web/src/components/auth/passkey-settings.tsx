"use client";

import { useEffect, useState } from "react";

import { passkeyErrorMessage } from "@/lib/auth/passkey-errors";
import { createClient } from "@/lib/supabase/client";

type PasskeyRow = {
  id: string;
  friendly_name?: string | null;
  created_at?: string;
};

type PasskeyAuth = {
  registerPasskey?: () => Promise<{ error: Error | null }>;
  passkey?: {
    list: () => Promise<{ data: PasskeyRow[] | null; error: Error | null }>;
    delete: (input: { passkeyId: string }) => Promise<{ error: Error | null }>;
  };
};

export function PasskeySettings() {
  const [items, setItems] = useState<PasskeyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function reload() {
    const supabase = createClient();
    const auth = supabase.auth as typeof supabase.auth & PasskeyAuth;
    if (!auth.passkey?.list) return;
    const { data, error: listError } = await auth.passkey.list();
    if (listError) {
      setError(passkeyErrorMessage(listError));
      return;
    }
    setItems(data ?? []);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addPasskey() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const supabase = createClient();
      const auth = supabase.auth as typeof supabase.auth & PasskeyAuth;
      if (!auth.registerPasskey) {
        setError("Passkey non disponibili in questa versione.");
        return;
      }
      const { error: registerError } = await auth.registerPasskey();
      if (registerError) {
        setError(passkeyErrorMessage(registerError));
        return;
      }
      setOk("Passkey aggiunta. La prossima volta puoi entrare senza password.");
      await reload();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const supabase = createClient();
      const auth = supabase.auth as typeof supabase.auth & PasskeyAuth;
      const { error: deleteError } = (await auth.passkey?.delete({
        passkeyId: id,
      })) ?? { error: new Error("Passkey non disponibili.") };
      if (deleteError) {
        setError(passkeyErrorMessage(deleteError));
        return;
      }
      setOk("Passkey rimossa.");
      await reload();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600">
        Entra con Face ID, impronta o chiave del computer, senza digitare la
        password.
      </p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            >
              <span className="font-medium text-neutral-800">
                {item.friendly_name?.trim() || "Passkey"}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removePasskey(item.id)}
                className="text-xs font-medium text-red-700 hover:underline disabled:opacity-50"
              >
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">Nessuna passkey salvata.</p>
      )}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {ok}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void addPasskey()}
        className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
      >
        {busy ? "Attendi…" : "Aggiungi passkey"}
      </button>
    </div>
  );
}
