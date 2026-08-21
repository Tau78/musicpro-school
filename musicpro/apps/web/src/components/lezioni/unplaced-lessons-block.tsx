import Link from "next/link";

import {
  getCourse,
  getLessonSchoolSettings,
  listUnplacedLessons,
  todayInRome,
  type CourseDetail,
  type Lesson,
  type LessonScheduleActor,
} from "@musicpro/database";

import { PlaceLessonForm } from "@/components/lezioni/place-lesson-form";
import { createClient } from "@/lib/supabase/server";

function formatDateTimeIt(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function UnplacedLessonsBlock({
  actor,
  rooms,
  courseDetailBaseHref,
  lessons: lessonsProp,
  courseId,
  titularMemberId,
}: {
  actor: LessonScheduleActor;
  rooms: { id: string; name: string }[];
  courseDetailBaseHref: string;
  lessons?: Lesson[];
  courseId?: string;
  titularMemberId?: string;
}) {
  const supabase = await createClient();
  const today = todayInRome();

  let lessons: Lesson[];
  try {
    lessons =
      lessonsProp ??
      (await listUnplacedLessons(supabase, { courseId, titularMemberId }));
  } catch (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error instanceof Error
          ? error.message
          : "Impossibile caricare le lezioni da piazzare."}
      </p>
    );
  }

  if (lessons.length === 0) return null;

  const courseIds = [...new Set(lessons.map((lesson) => lesson.courseId))];
  const [courseRows, settings] = await Promise.all([
    Promise.all(courseIds.map((id) => getCourse(supabase, id))),
    getLessonSchoolSettings(supabase),
  ]);

  const detailsById = new Map<string, CourseDetail>();
  for (const detail of courseRows) {
    if (detail) detailsById.set(detail.id, detail);
  }

  const slotStepMinutes = settings?.slotGranularityMinutes ?? 15;

  return (
    <section className="space-y-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
      <h3 className="text-sm font-semibold text-[var(--brand)]">
        Da mettere in calendario
      </h3>
      <ul className="space-y-3">
        {lessons.map((lesson) => {
          const detail = detailsById.get(lesson.courseId);
          const online = detail?.courseKind === "online";
          const isRecovery = lesson.placement === "da_recuperare";
          const courseName = detail?.name ?? "Corso";
          return (
            <li
              key={lesson.id}
              className="space-y-2 rounded-lg border border-neutral-100 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`${courseDetailBaseHref}/${lesson.courseId}`}
                  className="font-medium text-[var(--brand)] hover:underline"
                >
                  {courseName}
                </Link>
                <span className="text-neutral-500">#{lesson.sequenceNumber}</span>
                {isRecovery ? (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                    Da recuperare
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Da piazzare
                  </span>
                )}
                {lesson.originalStartsAt ? (
                  <span className="text-neutral-500">
                    Originale: {formatDateTimeIt(lesson.originalStartsAt)}
                  </span>
                ) : null}
              </div>
              <PlaceLessonForm
                lessonId={lesson.id}
                rooms={rooms}
                requiresRoom={!online}
                defaultRoomId={lesson.roomId ?? detail?.roomId ?? null}
                actor={actor}
                slotStepMinutes={slotStepMinutes}
                minDate={isRecovery ? today : undefined}
                label={isRecovery ? "Nuova data e ora" : undefined}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
