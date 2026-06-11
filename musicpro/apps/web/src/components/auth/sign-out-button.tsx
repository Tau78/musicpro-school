"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignOut() {
    setIsLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isLoading}
      className={
        className ??
        "text-sm text-neutral-600 underline hover:text-neutral-900 disabled:opacity-60"
      }
    >
      {isLoading ? "Uscita…" : "Esci"}
    </button>
  );
}
