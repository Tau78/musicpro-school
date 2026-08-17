import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles, listMyBands } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { BandCard } from "@/components/band/band-card";
import { BandCreateForm } from "@/components/band/band-create-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export default async function BandDashboardPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const bands = await listMyBands(supabase);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              Le mie band
            </h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          ← Torna alla dashboard
        </Link>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-[var(--brand)]">
            Band a cui appartieni
          </h2>
          {bands.length > 0 ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {bands.map((band) => (
                <li key={band.id}>
                  <BandCard band={band} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
              Non fai ancora parte di nessuna band. Creane una nuova qui sotto
              oppure accetta un invito ricevuto via email.
            </p>
          )}
        </section>

        <section className="mt-8">
          <BandCreateForm />
        </section>
      </div>
    </main>
  );
}
