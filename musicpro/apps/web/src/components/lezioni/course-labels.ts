import {
  minutesToTimeLabel,
  type CourseKind,
  type CourseStatus,
  type IsoWeekday,
} from "@musicpro/database";

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  in_attesa: "In attesa",
  attivo: "Attivo",
  rifiutato: "Rifiutato",
  in_pausa: "In pausa",
  chiuso: "Chiuso",
};

export const COURSE_KIND_LABELS: Record<CourseKind, string> = {
  individuale: "Individuale",
  gruppo: "Gruppo",
  online: "Online",
};

export const WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Lunedì",
  2: "Martedì",
  3: "Mercoledì",
  4: "Giovedì",
  5: "Venerdì",
  6: "Sabato",
  7: "Domenica",
};

export function courseStatusLabel(status: CourseStatus): string {
  return COURSE_STATUS_LABELS[status] ?? status;
}

export function courseKindLabel(kind: CourseKind): string {
  return COURSE_KIND_LABELS[kind] ?? kind;
}

export function courseSlotLabel(course: {
  weeklyDow: IsoWeekday | number;
  weeklyStartMinute: number;
  durationMinutes: number;
}): string {
  const day =
    WEEKDAY_LABELS[course.weeklyDow as IsoWeekday] ??
    `Giorno ${course.weeklyDow}`;
  return `${day} ${minutesToTimeLabel(course.weeklyStartMinute)} · ${course.durationMinutes} min`;
}

export function courseStatusClass(status: CourseStatus): string {
  switch (status) {
    case "attivo":
      return "bg-green-50 text-green-800";
    case "in_attesa":
      return "bg-amber-50 text-amber-800";
    case "rifiutato":
      return "bg-red-50 text-red-800";
    case "in_pausa":
    case "chiuso":
    default:
      return "bg-neutral-100 text-neutral-700";
  }
}
