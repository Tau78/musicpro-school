import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getTeacherProfile,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseCreateForm } from "@/components/lezioni/course-create-form";
import { loadCourseCreateData } from "@/components/lezioni/load-course-page-data";
import { createClient } from "@/lib/supabase/server";

export default async function NuovoCorsoDocentePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const [profile, data] = await Promise.all([
    getTeacherProfile(supabase, member.id),
    loadCourseCreateData(supabase, false),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/lezioni/corsi"
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
        isStaff={false}
        canCreateCourses={profile?.canCreateCourses ?? false}
        subjects={data.subjects}
        rooms={data.rooms}
        members={data.members}
        sundayVisible={data.sundayVisible}
        gridOpenMinute={data.gridOpenMinute}
        gridCloseMinute={data.gridCloseMinute}
        slotGranularityMinutes={data.slotGranularityMinutes}
        defaultGroupCapacity={data.defaultGroupCapacity}
        currentTerm={data.currentTerm}
      />
    </div>
  );
}
