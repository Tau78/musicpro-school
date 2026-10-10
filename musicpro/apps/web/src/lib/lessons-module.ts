export type LessonsModuleMode = "off" | "sandbox" | "live";

const LESSONS_PATH_PREFIXES = [
  "/lezioni",
  "/admin/lezioni",
  "/api/lezioni",
  "/tabellone",
] as const;

function readLessonsModuleRaw(): string {
  return (
    process.env.NEXT_PUBLIC_LESSONS_MODULE ??
    process.env.LESSONS_MODULE ??
    "live"
  )
    .trim()
    .toLowerCase();
}

export function getLessonsModuleMode(): LessonsModuleMode {
  const raw = readLessonsModuleRaw();
  if (raw === "off" || raw === "disabled" || raw === "0" || raw === "false") {
    return "off";
  }
  if (raw === "sandbox" || raw === "staging" || raw === "preview") {
    return "sandbox";
  }
  return "live";
}

export function isLessonsModuleEnabled(): boolean {
  const mode = getLessonsModuleMode();
  return mode === "sandbox" || mode === "live";
}

export function isLessonsSandboxMode(): boolean {
  return getLessonsModuleMode() === "sandbox";
}

export function getLessonsSandboxPublicUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_LESSONS_SANDBOX_URL?.trim();
  return url && url.startsWith("http") ? url : null;
}

export function isLessonsPath(pathname: string): boolean {
  return LESSONS_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function lessonsModuleApiDisabledBody() {
  return {
    success: false,
    message:
      "Modulo lezioni disattivato su questo ambiente. Usa la sandbox lezioni.",
  } as const;
}

/** Risposta 503 per route API lezioni quando il modulo è off. */
export function lessonsModuleDisabledStatus() {
  return { body: lessonsModuleApiDisabledBody(), status: 503 as const };
}
