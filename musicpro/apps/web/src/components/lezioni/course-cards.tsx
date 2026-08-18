import Link from "next/link";

import type { Course } from "@musicpro/database";

import {
  courseSlotLabel,
  courseStatusClass,
  courseStatusLabel,
  courseTrialBadgeClass,
  courseTrialLabel,
} from "@/components/lezioni/course-labels";

export function CourseCards({
  courses,
  hrefFor,
}: {
  courses: Course[];
  hrefFor: (id: string) => string;
}) {
  if (courses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-4 text-sm text-neutral-600">
        Nessun corso.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
      {courses.map((course) => (
        <li key={course.id}>
          <Link
            href={hrefFor(course.id)}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900">
                {course.name}
              </p>
              <p className="truncate text-sm text-neutral-500">
                {courseSlotLabel(course)}
              </p>
            </div>
            {course.isTrial ? (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${courseTrialBadgeClass()}`}
              >
                {courseTrialLabel()}
              </span>
            ) : null}
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${courseStatusClass(course.status)}`}
            >
              {courseStatusLabel(course.status)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
