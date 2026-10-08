import Link from "next/link";

import { getLessonsSandboxPublicUrl } from "@/lib/lessons-module";

export function LessonsUnavailableNotice() {
  const sandboxUrl = getLessonsSandboxPublicUrl();

  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-sm">
      <p className="font-medium text-neutral-900">Area lezioni in sandbox</p>
      <p className="mt-1 text-neutral-600">
        Su questo sito restano attive solo prenotazioni sala e strumenti
        operativi. Corsi, presenze e pagamenti lezioni si provano
        sull&apos;ambiente dedicato.
      </p>
      {sandboxUrl ? (
        <Link
          href={sandboxUrl}
          className="btn-brand mt-3 inline-flex rounded-lg px-3 py-2 text-sm font-medium"
        >
          Apri sandbox lezioni
        </Link>
      ) : (
        <p className="mt-2 text-xs text-neutral-500">
          Chiedi a segreteria l&apos;URL sandbox (env{" "}
          <code className="text-neutral-600">NEXT_PUBLIC_LESSONS_SANDBOX_URL</code>
          ).
        </p>
      )}
    </div>
  );
}
