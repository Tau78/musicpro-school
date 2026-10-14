import { getActiveCourseCoordinator } from "@musicpro/database";

import { AssignCoordinatorForm } from "@/components/lezioni/assign-coordinator-form";
import { loadDocenteTeacherOptionsCached } from "@/components/lezioni/load-course-page-data";
import { createClient } from "@/lib/supabase/server";

export async function AdminCourseCoordinatorSection({
  courseId,
  titularMemberId,
  actorMemberId,
}: {
  courseId: string;
  titularMemberId: string;
  actorMemberId: string;
}) {
  const supabase = await createClient();
  const [coordinator, teachers] = await Promise.all([
    getActiveCourseCoordinator(supabase, courseId),
    loadDocenteTeacherOptionsCached(),
  ]);

  return (
    <AssignCoordinatorForm
      key={coordinator?.memberId ?? "none"}
      courseId={courseId}
      titularMemberId={titularMemberId}
      actorMemberId={actorMemberId}
      teachers={teachers}
      current={
        coordinator
          ? {
              memberId: coordinator.memberId,
              firstName: coordinator.firstName,
              lastName: coordinator.lastName,
              startsOn: coordinator.startsOn,
            }
          : null
      }
    />
  );
}

export function AdminCourseCoordinatorSectionSkeleton() {
  return (
    <section className="animate-pulse rounded-xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-black/5">
      <div className="mb-2.5 h-3 w-28 rounded bg-neutral-200" />
      <div className="h-10 rounded-lg bg-neutral-100" />
    </section>
  );
}
