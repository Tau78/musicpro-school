"use client";

import {
  ADMIN_LEZIONI_NAV,
  LezioniSideNav,
} from "@/components/lezioni/lezioni-side-nav";

export function AdminLezioniSubNav() {
  return <LezioniSideNav groups={ADMIN_LEZIONI_NAV} />;
}
