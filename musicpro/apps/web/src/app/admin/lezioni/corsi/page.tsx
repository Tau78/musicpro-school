import Link from "next/link";
import { redirect } from "next/navigation";

import { expireDueHolds, listCourses } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseCards } from "@/components/lezioni/course-cards";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLezioniCorsiPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/corsi"
        : "/admin/rimborsi",
    );
  }

  await expireDueHolds(supabase);
  const courses = await listCourses(supabase);

  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-end gap-2">
        <Link
          href="/admin/lezioni/coda"
          className="inline-flex items-center justify-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          Coda
        </Link>
        <Link
          href="/admin/lezioni/corsi/nuova-prova"
          className="inline-flex items-center justify-center rounded-lg border border-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand)] hover:bg-[var(--brand)]/5"
        >
          Nuova prova
        </Link>
        <Link
          href="/admin/lezioni/corsi/nuovo"
          className="inline-flex items-center justify-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand)]/90"
        >
          Nuovo
        </Link>
      </div>

      <CourseCards
        courses={courses}
        hrefFor={(id) => `/admin/lezioni/corsi/${id}`}
      />
    </div>
  );
}
