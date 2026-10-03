"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import { ChangePasswordForm } from "./change-password-form";

/** Primo accesso dopo l'import SuperSaaS: riusa il form di Impostazioni. */
export function PasswordChangePrompt() {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setRequired(data.user?.user_metadata?.password_change_required === true);
    });
  }, []);

  if (!required) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-change-title"
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
      >
        <h2
          id="password-change-title"
          className="text-sm font-medium text-neutral-800"
        >
          Scegli una password nuova
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Ti consigliamo di cambiarla dalle Impostazioni dopo il primo accesso.
        </p>
        <div className="mt-3">
          <ChangePasswordForm onUpdated={() => setRequired(false)} />
        </div>
      </div>
    </div>
  );
}
