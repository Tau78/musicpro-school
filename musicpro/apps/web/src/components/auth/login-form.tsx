"use client";

import { Suspense } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { AuthSignInPanel } from "@/components/auth/auth-sign-in-panel";

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
          Caricamento…
        </div>
      }
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandLogo href="/prenotazioni" size="md" />
        </div>
        <AuthSignInPanel defaultRedirect="/dashboard" />
      </div>
    </Suspense>
  );
}
