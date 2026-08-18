import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  getLessonSchoolSettings,
  getMemberById,
  getTeacherProfile,
  listLessonSubjects,
  listTeacherAvailability,
  listTeacherSubjects,
  listTeacherTimeOff,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { TeacherAvailabilityPanel } from "@/components/lezioni/teacher-availability-panel";
import { TeacherGcalConnect } from "@/components/lezioni/teacher-gcal-connect";
import { TeacherProfileReadonly } from "@/components/lezioni/teacher-profile-readonly";
import { TeacherSettingsPanel } from "@/components/lezioni/teacher-settings-panel";
import { createClient } from "@/lib/supabase/server";

export default async function LezioniImpostazioniPage() {
  const supabase = await createClient();
  const currentMember = await getCurrentMemberWithRoles(supabase);

  if (!currentMember?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const [member, profile, teacherSubjects, subjects, slots, timeOff, settings] =
    await Promise.all([
      getMemberById(supabase, currentMember.id),
      getTeacherProfile(supabase, currentMember.id),
      listTeacherSubjects(supabase, currentMember.id),
      listLessonSubjects(supabase),
      listTeacherAvailability(supabase, currentMember.id),
      listTeacherTimeOff(supabase, currentMember.id),
      getLessonSchoolSettings(supabase),
    ]);

  const assignedSubjectIds = new Set(
    teacherSubjects.map((row) => row.subjectId),
  );
  const subjectNames = subjects
    .filter((subject) => assignedSubjectIds.has(subject.id))
    .map((subject) => subject.name);

  return (
    <TeacherSettingsPanel
      profilo={
        <TeacherProfileReadonly
          firstName={member?.firstName ?? currentMember.firstName}
          lastName={member?.lastName ?? currentMember.lastName}
          email={member?.email ?? currentMember.email}
          phone={member?.phone ?? null}
          subjectNames={subjectNames}
          canCreateCourses={profile?.canCreateCourses ?? false}
          canReschedule={profile?.canReschedule ?? false}
          canCloseCourses={profile?.canCloseCourses ?? false}
          paymentVisibility={profile?.paymentVisibility ?? "hidden"}
        />
      }
      orari={
        <TeacherAvailabilityPanel
          memberId={currentMember.id}
          initialSlots={slots}
          initialTimeOff={timeOff}
          sundayVisible={settings?.sundayVisible ?? false}
          gridOpenMinute={settings?.gridOpenMinute ?? 600}
          gridCloseMinute={settings?.gridCloseMinute ?? 1380}
        />
      }
      calendario={<TeacherGcalConnect />}
    />
  );
}
