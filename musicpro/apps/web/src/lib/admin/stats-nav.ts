export const STATS_PATH_PREFIX = "/admin/stats";

export const STATS_SUBSECTION_HREFS = {
  panoramica: "/admin/stats",
  utilizzo: "/admin/stats/utilizzo",
} as const;

export function isStatsPath(pathname: string): boolean {
  return (
    pathname === STATS_PATH_PREFIX ||
    pathname.startsWith(`${STATS_PATH_PREFIX}/`)
  );
}
