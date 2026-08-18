import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { LessonFeesPanel } from "@/components/lezioni/lesson-fees-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";

interface PageProps {
  searchParams: Promise<{ pagato?: string }>;
}

export default async function AdminLezioniRettePage({
  searchParams,
}: PageProps) {
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni"
        : "/admin/rimborsi",
    );
  }

  const { pagato } = await searchParams;

  return (
    <LessonFeesPanel
      actorMemberId={member.id}
      paymentReceived={pagato === "1"}
    />
  );
}
