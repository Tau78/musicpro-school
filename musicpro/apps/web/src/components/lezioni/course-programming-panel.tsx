"use client";

import {
  formatBookingDateTime,
  todayInRome,
  type Lesson,
} from "@musicpro/database";

import type { CourseLessonProgrammingHint } from "@/components/lezioni/load-course-page-data";

export type { CourseLessonProgrammingHint };

export type LessonProgrammingTone = "covered" | "planned" | "absent_paid";

const TONE_DOT: Record<LessonProgrammingTone, string> = {
  covered: "bg-emerald-500",
  planned: "bg-neutral-300",
  absent_paid: "bg-red-500",
};

const TONE_LABEL: Record<LessonProgrammingTone, string> = {
  covered: "Coperto",
  planned: "Pianificato",
  absent_paid: "Pagato · assente",
};

/**
 * Verde = credito consumato / lezione coperta.
 * Grigio = futuro, da piazzare, recupero, salti scuola.
 * Rosso (MVP): vedi TODO — docs/LEZIONI_PRODOTTO_DECISIONS.md § Tab Programmazione.
 */
export function resolveLessonProgrammingTone(
  lesson: Lesson,
  hint: CourseLessonProgrammingHint | undefined,
  nowMs: number,
): LessonProgrammingTone {
  if (hint?.hasCreditConsumption) {
    return "covered";
  }

  const unplaced =
    lesson.placement === "da_piazzare" || lesson.placement === "da_recuperare";
  if (unplaced || !lesson.startsAt) {
    return "planned";
  }

  if (
    lesson.parkedReason === "cancellata_scuola" ||
    lesson.parkedReason === "giustificato"
  ) {
    return "planned";
  }

  const startMs = Date.parse(lesson.startsAt);
  if (!Number.isFinite(startMs) || startMs > nowMs) {
    return "planned";
  }

  // TODO(red): pagato + assente — richiede join rette saldate + presenze per slot;
  // vedi docs/LEZIONI_PRODOTTO_DECISIONS.md (batch 2, Tab Programmazione).
  return "planned";
}

function sortLessonsForProgramming(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => {
    const aMs = a.startsAt ? Date.parse(a.startsAt) : Number.NaN;
    const bMs = b.startsAt ? Date.parse(b.startsAt) : Number.NaN;
    const aHas = Number.isFinite(aMs);
    const bHas = Number.isFinite(bMs);
    if (aHas && bHas && aMs !== bMs) return aMs - bMs;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return a.sequenceNumber - b.sequenceNumber;
  });
}

function lessonWhenLabel(lesson: Lesson): string {
  if (lesson.startsAt && lesson.endsAt) {
    return formatBookingDateTime(lesson.startsAt, lesson.endsAt);
  }
  if (lesson.placement === "da_piazzare") return "Da piazzare";
  if (lesson.placement === "da_recuperare") return "Da recuperare";
  return "—";
}

function compactStatusBadge(lesson: Lesson): string | null {
  if (lesson.parkedReason === "cancellata_scuola") return "Festività";
  if (lesson.parkedReason === "giustificato") return "Saltata";
  if (lesson.placement === "da_piazzare") return "Da piazzare";
  if (lesson.placement === "da_recuperare") return "Recupero";
  return null;
}

export function CourseProgrammingPanel({
  lessons,
  hintsByLessonId,
  courseKind,
  roomsById,
}: {
  lessons: Lesson[];
  hintsByLessonId: Record<string, CourseLessonProgrammingHint>;
  courseKind: "individuale" | "gruppo" | "online";
  roomsById: Record<string, string>;
}) {
  const nowMs = Date.now();
  const sorted = sortLessonsForProgramming(lessons);
  const today = todayInRome();

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        Nessuna lezione programmata per questo corso.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        {(Object.keys(TONE_LABEL) as LessonProgrammingTone[])
          .filter((tone) => tone !== "absent_paid")
          .map((tone) => (
            <span key={tone} className="inline-flex items-center gap-1">
              <span
                className={`size-2 shrink-0 rounded-full ${TONE_DOT[tone]}`}
                aria-hidden
              />
              {TONE_LABEL[tone]}
            </span>
          ))}
      </div>

      <ul className="divide-y divide-neutral-100">
        {sorted.map((lesson) => {
          const tone = resolveLessonProgrammingTone(
            lesson,
            hintsByLessonId[lesson.id],
            nowMs,
          );
          const badge = compactStatusBadge(lesson);
          const sala =
            courseKind === "online"
              ? "Online"
              : lesson.roomId
                ? (roomsById[lesson.roomId] ?? "—")
                : "—";
          const isPast =
            lesson.startsAt &&
            Date.parse(lesson.startsAt) <= nowMs &&
            lesson.placement === "scheduled";

          return (
            <li
              key={lesson.id}
              className="flex min-h-9 items-center gap-2 py-1.5 text-sm"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${TONE_DOT[tone]}`}
                title={TONE_LABEL[tone]}
                aria-label={TONE_LABEL[tone]}
              />
              <span className="w-7 shrink-0 tabular-nums text-neutral-400">
                #{lesson.sequenceNumber}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${isPast ? "text-neutral-700" : "text-neutral-900"}`}
              >
                {lessonWhenLabel(lesson)}
              </span>
              <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">
                {sala}
              </span>
              {badge ? (
                <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                  {badge}
                </span>
              ) : null}
              {lesson.startsAt && lesson.startsAt.slice(0, 10) === today ? (
                <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
                  Oggi
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
