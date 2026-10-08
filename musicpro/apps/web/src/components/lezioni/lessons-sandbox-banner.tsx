import { isLessonsSandboxMode } from "@/lib/lessons-module";

export function LessonsSandboxBanner() {
  if (!isLessonsSandboxMode()) {
    return null;
  }

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-300/90 bg-amber-50 px-3 py-2 text-sm text-amber-950"
    >
      <span className="font-semibold">Sandbox lezioni</span>
      <span className="text-amber-900/90">
        {" "}
        — dati di test; le prenotazioni sala in produzione non sono toccate.
      </span>
    </div>
  );
}
