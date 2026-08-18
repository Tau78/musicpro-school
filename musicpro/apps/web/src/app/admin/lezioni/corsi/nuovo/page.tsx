import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { CourseCreateForm } from "@/components/lezioni/course-create-form";
import { loadCourseCreateData } from "@/components/lezioni/load-course-page-data";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminNuovoCorsoPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/corsi/nuovo"
        : "/admin/rimborsi",
    );
  }

  const data = await loadCourseCreateData(supabase, true);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/lezioni/corsi"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna ai corsi
        </Link>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand)]">
          Nuovo corso
        </h2>
      </div>

      <CourseCreateForm
        actorMemberId={member.id}
        isStaff
        canCreateCourses
        subjects={data.subjects}
        rooms={data.rooms}
        members={data.members}
        sundayVisible={data.sundayVisible}
        gridOpenMinute={data.gridOpenMinute}
        gridCloseMinute={data.gridCloseMinute}
        defaultGroupCapacity={data.defaultGroupCapacity}
        currentTerm={data.currentTerm}
        teachers={data.teachers}
      />
    </div>
  );
}
