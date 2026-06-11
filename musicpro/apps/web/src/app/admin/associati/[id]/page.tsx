import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getMemberById,
} from "@musicpro/database";

import { MemberForm } from "@/components/admin/member-form";
import {
  canDeleteMembers,
  canManageMembers,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssociatoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);

  if (!currentMember || !canManageMembers(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const member = await getMemberById(supabase, id);

  if (!member) {
    notFound();
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/associati"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna alla rubrica
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand)]">
          {member.lastName} {member.firstName}
        </h2>
      </div>

      <MemberForm
        member={member}
        canDelete={canDeleteMembers(currentMember.roles)}
      />
    </div>
  );
}
