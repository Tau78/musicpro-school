import Link from "next/link";

import {
  formatBookingDateTime,
  formatEuro,
  type CourseDetail,
  type Lesson,
} from "@musicpro/database";

import {
  courseKindLabel,
  courseSlotLabel,
  courseStatusClass,
  courseStatusLabel,
} from "@/components/lezioni/course-labels";

export function CourseDetailView({
  course,
  lessons,
  roomsById,
  backHref,
  pendingNote = false,
}: {
  course: CourseDetail;
  lessons: Lesson[];
  roomsById: Record<string, string>;
  backHref: string;
  pendingNote?: boolean;
}) {
  const titularLabel = course.titular
    ? `${course.titular.lastName} ${course.titular.firstName}`.trim()
    : "—";
  const roomLabel =
    course.courseKind === "online"
      ? "Online"
      : course.roomId
        ? (roomsById[course.roomId] ?? "—")
        : "—";

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={backHref}
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna ai corsi
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold text-[var(--brand)]">
            {course.name}
          </h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${courseStatusClass(course.status)}`}
          >
            {courseStatusLabel(course.status)}
          </span>
        </div>
      </div>

      {pendingNote && course.status === "in_attesa" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Approva dalla Coda
        </p>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Dettaglio
        </legend>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Materia" value={course.subjectName ?? "—"} />
          <Row label="Tipo" value={courseKindLabel(course.courseKind)} />
          <Row label="Titolare" value={titularLabel} />
          <Row label="Sala" value={roomLabel} />
          <Row label="Slot" value={courseSlotLabel(course)} />
          <Row label="Inizio" value={course.startsOn} />
          {course.courseKind === "gruppo" ? (
            <Row label="Capienza" value={String(course.maxStudents)} />
          ) : null}
          <Row label="Prezzo" value={formatEuro(course.priceEur)} />
        </dl>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Iscritti
        </legend>
        {course.enrollments.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessun iscritto.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {course.enrollments.map((enrollment) => (
              <li
                key={enrollment.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-medium text-neutral-900">
                  {`${enrollment.lastName} ${enrollment.firstName}`.trim()}
                </span>
                {enrollment.email ? (
                  <span className="text-neutral-500">{enrollment.email}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-[var(--brand)]">
          Lezioni
        </legend>
        {lessons.length === 0 ? (
          <p className="text-sm text-neutral-500">Nessuna lezione.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {lessons.map((lesson) => {
              const sala =
                course.courseKind === "online"
                  ? "Online"
                  : lesson.roomId
                    ? (roomsById[lesson.roomId] ?? "—")
                    : "—";
              const when =
                lesson.startsAt && lesson.endsAt
                  ? formatBookingDateTime(lesson.startsAt, lesson.endsAt)
                  : "—";
              return (
                <li
                  key={lesson.id}
                  className="flex flex-wrap items-center gap-2 py-2 text-sm"
                >
                  <span className="w-8 shrink-0 text-neutral-400">
                    #{lesson.sequenceNumber}
                  </span>
                  <span className="min-w-0 flex-1 text-neutral-900">{when}</span>
                  <span className="text-neutral-500">{sala}</span>
                  {lesson.placement === "da_piazzare" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Da piazzare
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
