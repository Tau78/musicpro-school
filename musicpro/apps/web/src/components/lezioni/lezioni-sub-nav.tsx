"use client";

import {
  LezioniSideNav,
  TEACHER_LEZIONI_NAV,
} from "@/components/lezioni/lezioni-side-nav";

export function LezioniSubNav() {
  return <LezioniSideNav groups={TEACHER_LEZIONI_NAV} />;
}
