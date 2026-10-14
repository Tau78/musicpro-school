import { notFound, redirect } from "next/navigation";

import {
  getCourse,
  getCurrentMemberWithRoles,
  getLessonSchoolSettings,
  getTeacherProfile,
  isActiveCourseCoordinator,
  listRoomsForLessons,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseDetailView } from "@/components/lezioni/course-detail-view";
import {
  loadCourseLessons,
  loadCourseProgrammingHints,
  roomsByIdFromList,
} from "@/components/lezioni/load-course-page-data";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CorsoDocenteDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const [course, lessons, rooms, profile, settings] = await Promise.all([
    getCourse(supabase, id),
    loadCourseLessons(supabase, id),
    listRoomsForLessons(supabase),
    getTeacherProfile(supabase, member.id),
    getLessonSchoolSettings(supabase),
  ]);

  if (!course) {
    notFound();
  }

  const programmingHintsByLessonId = await loadCourseProgrammingHints(
    supabase,
    lessons.map((lesson) => lesson.id),
  );

  const isTitular = course.titularMemberId === member.id;
  const isCoordinator = isTitular
    ? false
    : await isActiveCourseCoordinator(supabase, course.id, member.id);

  if (!isTitular && !isCoordinator) {
    notFound();
  }

  const readOnly = isCoordinator && !isTitular;

  return (
    <CourseDetailView
      course={course}
      lessons={lessons}
      programmingHintsByLessonId={programmingHintsByLessonId}
      roomsById={roomsByIdFromList(rooms)}
      rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
      backHref="/lezioni/corsi"
      actorMemberId={member.id}
      isStaff={false}
      readOnly={readOnly}
      showPrice={readOnly ? false : profile?.paymentVisibility !== "hidden"}
      canCreateCourses={readOnly ? false : (profile?.canCreateCourses ?? false)}
      canReschedule={readOnly ? false : (profile?.canReschedule ?? false)}
      canCloseCourses={readOnly ? false : (profile?.canCloseCourses ?? false)}
      slotStepMinutes={settings?.slotGranularityMinutes ?? 15}
      sundayVisible={settings?.sundayVisible ?? false}
      gridOpenMinute={settings?.gridOpenMinute ?? 600}
      gridCloseMinute={settings?.gridCloseMinute ?? 1380}
    />
  );
}
