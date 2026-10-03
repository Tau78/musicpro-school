"use client";

import { LessonsWorkspaceNav } from "@/components/lezioni/lessons-workspace-nav";
import { TEACHER_LEZIONI_NAV } from "@/components/lezioni/lezioni-side-nav";

export function LezioniSubNav() {
  return <LessonsWorkspaceNav groups={TEACHER_LEZIONI_NAV} title="Lezioni" />;
}
