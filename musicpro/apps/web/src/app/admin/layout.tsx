import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  canAccessAdmin,
  canManageMembers,
  canManageReimbursements,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked&redirect=/admin");
  }

  if (!canAccessAdmin(member.roles)) {
    redirect("/dashboard?error=unauthorized");
  }

  const showRubrica = canManageMembers(member.roles);
  const showRimborsi = canManageReimbursements(member.roles);

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20 md:pb-0">
      <header className="bg-[var(--brand)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold">Amministrazione</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="hidden text-sm text-white/80 hover:text-white sm:inline"
            >
              Dashboard
            </Link>
            <SignOutButton className="border-white/30 text-white hover:bg-white/10" />
          </div>
        </div>
        <AdminNav showRubrica={showRubrica} showRimborsi={showRimborsi} />
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
