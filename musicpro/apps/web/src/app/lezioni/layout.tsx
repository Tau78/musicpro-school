import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { APP_NAME, MemberRole } from "@musicpro/shared";

import { SettingsGearLink } from "@/components/dashboard/settings-gear-link";
import { LezioniSubNav } from "@/components/lezioni/lezioni-sub-nav";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LezioniLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/lezioni");
  }

  const isDocente = member.roles.includes(MemberRole.Docente);
  const isStaff = canManageMembers(member.roles);

  if (!isDocente && !isStaff) {
    redirect("/dashboard?error=unauthorized");
  }

  if (isStaff && !isDocente) {
    redirect("/admin/lezioni");
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="bg-[var(--brand)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold">Lezioni</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-white/80 hover:text-white"
            >
              Dashboard
            </Link>
            <SettingsGearLink className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <LezioniSubNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  );
}
