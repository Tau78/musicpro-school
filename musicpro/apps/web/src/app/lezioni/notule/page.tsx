import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  listLessonPayrolls,
  previewLessonPayroll,
  todayInRome,
  yearMonthFromRomeDate,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { PayrollTeacherPanel } from "@/components/lezioni/payroll-teacher-panel";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniNotulePage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const { year, month } = yearMonthFromRomeDate(todayInRome());
  const [preview, payrolls] = await Promise.all([
    previewLessonPayroll(supabase, member.id, year, month),
    listLessonPayrolls(supabase, { teacherMemberId: member.id }),
  ]);

  return (
    <PayrollTeacherPanel
      teacherMemberId={member.id}
      preview={preview}
      payrolls={payrolls}
    />
  );
}
