import type { CalendarLesson } from "@musicpro/database";

/**
 * Helper condivisi server + client.
 * Non importare da moduli `"use client"` (es. lessons-oggi) nei Server Components.
 */
export type OggiLesson = CalendarLesson & { hasAttendance?: boolean };

/** Corso collegato alla card calendario (lezione o hold in attesa). */
export function lessonCourseId(
  lesson: Pick<CalendarLesson, "id" | "courseId">,
): string {
  if (lesson.courseId) return lesson.courseId;
  if (lesson.id.startsWith("hold:")) return lesson.id.slice(5);
  return lesson.id;
}

export function oggiLessonTitle(lesson: OggiLesson): string {
  const name = (lesson.courseName ?? "").trim();
  return name || lesson.studentNames[0] || "Lezione";
}
