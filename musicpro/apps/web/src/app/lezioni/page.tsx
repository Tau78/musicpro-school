import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import {
  loadTeacherHomeData,
  TeacherHome,
} from "@/components/lezioni/teacher-home";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/dashboard");
  }

  const data = await loadTeacherHomeData(member.id);

  return <TeacherHome firstName={member.firstName} data={data} />;
}
