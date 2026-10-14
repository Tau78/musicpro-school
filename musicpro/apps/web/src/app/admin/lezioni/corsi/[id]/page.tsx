import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { getCourse } from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import {
  AdminCourseCoordinatorSection,
  AdminCourseCoordinatorSectionSkeleton,
} from "@/components/lezioni/admin-course-coordinator-section";
import { CourseDetailPageLoading } from "@/components/lezioni/course-detail-page-loading";
import { CourseDetailView } from "@/components/lezioni/course-detail-view";
import {
  loadCourseLessons,
  loadCoursePackPricesCached,
  loadCourseProgrammingHints,
  loadDocenteTeacherOptionsCached,
  loadLessonSchoolSettingsCached,
  loadLessonSubjectsCached,
  loadRoomsForLessonsCached,
  roomsByIdFromList,
} from "@/components/lezioni/load-course-page-data";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminCorsoDetailPage(props: PageProps) {
  return (
    <Suspense fallback={<CourseDetailPageLoading />}>
      <AdminCorsoDetailContent {...props} />
    </Suspense>
  );
}

async function AdminCorsoDetailContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? `/lezioni/corsi/${id}`
        : "/admin/rimborsi",
    );
  }

  const [course, lessons, rooms, settings, subjects, packPrices, teachers] =
    await Promise.all([
      getCourse(supabase, id),
      loadCourseLessons(supabase, id),
      loadRoomsForLessonsCached(),
      loadLessonSchoolSettingsCached(),
      loadLessonSubjectsCached(),
      loadCoursePackPricesCached(),
      loadDocenteTeacherOptionsCached(),
    ]);

  if (!course) {
    notFound();
  }

  const programmingHintsByLessonId = await loadCourseProgrammingHints(
    supabase,
    lessons.map((lesson) => lesson.id),
  );

  return (
    <div className="space-y-6">
      <CourseDetailView
        course={course}
        lessons={lessons}
        programmingHintsByLessonId={programmingHintsByLessonId}
        roomsById={roomsByIdFromList(rooms)}
        rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
        backHref="/admin/lezioni/corsi"
        pendingNote
        isStaff
        showPrice
        actorMemberId={member.id}
        canCreateCourses
        canReschedule
        teachers={teachers}
        slotStepMinutes={settings?.slotGranularityMinutes ?? 15}
        editSubjects={subjects.map((row) => ({ id: row.id, name: row.name }))}
        editPackPrices={packPrices.map((row) => ({
          courseKind: row.courseKind,
          durationMinutes: row.durationMinutes,
          amountEur: row.amountEur,
        }))}
        sundayVisible={settings?.sundayVisible ?? false}
        gridOpenMinute={settings?.gridOpenMinute ?? 600}
        gridCloseMinute={settings?.gridCloseMinute ?? 1380}
      />
      {!course.isTrial ? (
        <Suspense fallback={<AdminCourseCoordinatorSectionSkeleton />}>
          <AdminCourseCoordinatorSection
            courseId={course.id}
            titularMemberId={course.titularMemberId}
            actorMemberId={member.id}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
