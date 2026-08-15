import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[var(--brand)]/5 to-[var(--background)] p-6">
      <ResetPasswordForm />
    </main>
  );
}
