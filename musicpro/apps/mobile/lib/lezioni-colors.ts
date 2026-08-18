/** Colori allineati al calendario web (fetta 6 / 15). */
export const LESSON_KIND_COLORS = {
  individuale: { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" },
  gruppo: { bg: "#e0f2fe", border: "#7dd3fc", text: "#075985" },
  online: { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" },
  prova: { bg: "#ffe4e6", border: "#fda4af", text: "#9f1239" },
} as const;

export function lessonColor(input: {
  courseKind: "individuale" | "gruppo" | "online";
  isTrial?: boolean;
}) {
  if (input.isTrial) return LESSON_KIND_COLORS.prova;
  return LESSON_KIND_COLORS[input.courseKind];
}
