import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
            Caricamento…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
