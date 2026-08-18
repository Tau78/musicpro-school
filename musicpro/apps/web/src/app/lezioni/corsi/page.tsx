import Link from "next/link";
import { redirect } from "next/navigation";

import {
  expireDueHolds,
  getCurrentMemberWithRoles,
  getTeacherProfile,
  listCourses,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseCards } from "@/components/lezioni/course-cards";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniCorsiPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  await expireDueHolds(supabase);

  const [courses, profile] = await Promise.all([
    listCourses(supabase, { titularMemberId: member.id }),
    getTeacherProfile(supabase, member.id),
  ]);

  const canCreate = profile?.canCreateCourses ?? false;

  return (
    <div>
      {canCreate ? (
        <div className="mb-6 flex flex-wrap justify-end gap-2">
          <Link
            href="/lezioni/corsi/nuova-prova"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
          >
            Nuova prova
          </Link>
          <Link
            href="/lezioni/corsi/nuovo"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
          >
            Nuovo
          </Link>
        </div>
      ) : null}

      <CourseCards courses={courses} hrefFor={(id) => `/lezioni/corsi/${id}`} />
    </div>
  );
}
