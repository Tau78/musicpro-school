"use client";

import { LessonsWorkspaceNav } from "@/components/lezioni/lessons-workspace-nav";
import { ADMIN_LEZIONI_NAV } from "@/components/lezioni/lezioni-side-nav";

export function AdminLezioniSubNav() {
  return <LessonsWorkspaceNav groups={ADMIN_LEZIONI_NAV} title="Lezioni" />;
}
