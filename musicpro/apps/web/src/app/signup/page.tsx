import { Suspense } from "react";

import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--brand)]/5 to-[var(--background)] p-6">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
            Caricamento…
          </div>
        }
      >
        <SignupForm />
      </Suspense>
    </main>
  );
}
