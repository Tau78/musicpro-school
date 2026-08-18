import Link from "next/link";
import { redirect } from "next/navigation";

import { MemberRole } from "@musicpro/shared";

import { loadCourseCreateData } from "@/components/lezioni/load-course-page-data";
import { TrialCreateForm } from "@/components/lezioni/trial-create-form";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export default async function AdminNuovaProvaPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/corsi/nuova-prova"
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
          Nuova prova
        </h2>
      </div>

      <TrialCreateForm
        actorMemberId={member.id}
        isStaff
        canCreateCourses
        subjects={data.subjects}
        rooms={data.rooms}
        currentTerm={data.currentTerm}
        teachers={data.teachers}
      />
    </div>
  );
}
