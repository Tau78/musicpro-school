import Link from "next/link";

import { formatCreditsCount } from "@musicpro/database";

import { formatLessonWhen } from "@/lib/ui/associate-theme";

type NextLesson = {
  subjectName: string;
  startsAt: string;
  teacherLabel: string;
};

type NextBooking = {
  roomName: string;
  whenLabel: string;
};

type MemberHomeProps = {
  firstName: string;
  /** Solo se l'associato è allievo (iscrizione corso attiva). */
  showNextLesson?: boolean;
  nextLesson: NextLesson | null;
  nextBooking: NextBooking | null;
  /** Crediti sala spendibili (1 credito = 1 €). */
  creditAvailable?: number;
};

export function MemberHome({
  firstName,
  showNextLesson = false,
  nextLesson,
  nextBooking,
  creditAvailable = 0,
}: MemberHomeProps) {
  const hasCredits = creditAvailable > 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--brand)] sm:text-4xl">
          Ciao, {firstName}
          <span aria-hidden className="ml-1">
            👋
          </span>
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Benvenuto nella tua area personale
        </p>
      </div>

      {showNextLesson ? (
        <section className="glass-card overflow-hidden p-0">
          <div className="border-b border-white/60 bg-gradient-to-br from-[var(--brand)]/[0.06] to-transparent px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
              Prossima lezione
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 px-5 py-5">
            <div className="min-w-0 flex-1">
              {nextLesson ? (
                <>
                  <p className="font-display text-xl font-semibold text-[var(--brand)]">
                    {nextLesson.subjectName}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    {formatLessonWhen(nextLesson.startsAt)} · Docente{" "}
                    {nextLesson.teacherLabel}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-xl font-semibold text-[var(--brand)]">
                    Nessuna lezione in programma
                  </p>
                  <p className="mt-1 text-sm text-neutral-600">
                    Quando la segreteria fissa un corso, lo vedrai qui.
                  </p>
                </>
              )}
            </div>
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-accent)]/15 text-2xl"
            >
              🎸
            </div>
          </div>
        </section>
      ) : null}

      {nextBooking ? (
        <section className="glass-card overflow-hidden p-0">
          <div className="border-b border-white/60 bg-gradient-to-br from-[#38764B]/[0.08] to-transparent px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#38764B]">
              Prossima prenotazione
            </p>
          </div>
          <Link
            href="/prenotazioni/mie"
            className="flex items-start justify-between gap-4 px-5 py-5 transition hover:bg-black/[0.02]"
          >
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl font-semibold text-[var(--brand)]">
                {nextBooking.roomName}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {nextBooking.whenLabel}
              </p>
            </div>
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#38764B]/15 text-2xl"
            >
              📅
            </div>
          </Link>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/shop"
          className="glass-card group block p-5 transition hover:border-[var(--brand)]/20"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-lg">
              🎟️
            </span>
            <div>
              <p className="font-medium text-[var(--brand)] group-hover:underline">
                Crediti
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {hasCredits
                  ? `${formatCreditsCount(creditAvailable)} · acquista altri`
                  : "Acquista crediti per le sale"}
              </p>
            </div>
          </div>
        </Link>

        <Link href="/prenotazioni" className="glass-card group block p-5 transition hover:border-[var(--brand)]/20">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#38764B]/15 text-lg">
              📅
            </span>
            <div>
              <p className="font-medium text-[var(--brand)] group-hover:underline">
                Prenota sala
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Scegli sala, orario e durata
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/dashboard/impostazioni"
          className="glass-card group block p-5 transition hover:border-[var(--brand)]/20"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--brand-accent)]/15 text-lg">
              📋
            </span>
            <div>
              <p className="font-medium text-[var(--brand)] group-hover:underline">
                La mia scheda
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                Profilo, band e crediti
              </p>
            </div>
          </div>
        </Link>
      </div>

      <p className="text-center text-sm italic text-neutral-500">
        La tua passione, il nostro palcoscenico
      </p>
    </div>
  );
}
