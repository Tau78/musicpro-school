import Link from "next/link";

import { MemberQuotaAlert } from "@/components/associate/member-quota-alert";
import type { MembershipStatus } from "@/lib/membership";
import { formatLessonWhen } from "@/lib/ui/associate-theme";

type NextLesson = {
  subjectName: string;
  startsAt: string;
  teacherLabel: string;
};

type MemberHomeProps = {
  firstName: string;
  /** Allievo = iscrizione corso attiva. Se false, niente blocco lezioni. */
  showLessons: boolean;
  nextLesson: NextLesson | null;
  quotaStatus?: Pick<
    MembershipStatus,
    "fiscalYear" | "formCompleted" | "quotaPaid" | "quotaAmountEur"
  > | null;
};

function SectionLabel({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--brand-accent)]">
      {children}
    </h2>
  );
}

function ActionCard({
  href,
  emoji,
  emojiBg,
  title,
  description,
}: {
  href: string;
  emoji: string;
  emojiBg: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="glass-card group block p-5 transition hover:border-[var(--brand)]/20"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${emojiBg}`}
        >
          {emoji}
        </span>
        <div>
          <p className="font-medium text-[var(--brand)] group-hover:underline">
            {title}
          </p>
          <p className="mt-1 text-sm text-neutral-600">{description}</p>
        </div>
      </div>
    </Link>
  );
}

export function MemberHome({
  firstName,
  showLessons,
  nextLesson,
  quotaStatus = null,
}: MemberHomeProps) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--brand)] sm:text-4xl">
          Ciao, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Benvenuto nella tua area personale
        </p>
      </div>

      {quotaStatus ? <MemberQuotaAlert {...quotaStatus} /> : null}

      {showLessons ? (
        <section className="space-y-3">
          <SectionLabel>Lezioni</SectionLabel>
          <div className="glass-card overflow-hidden p-0">
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
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionLabel>Sala prove</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <ActionCard
            href="/prenotazioni"
            emoji="📅"
            emojiBg="bg-[#38764B]/15"
            title="Prenota sala"
            description="Scegli sala, orario e durata"
          />
          <ActionCard
            href="/prenotazioni/mie"
            emoji="🗓️"
            emojiBg="bg-[#38764B]/15"
            title="Le mie prenotazioni"
            description="Prossime prove e storico"
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Anagrafica</SectionLabel>
        <ActionCard
          href="/dashboard/impostazioni"
          emoji="📋"
          emojiBg="bg-[var(--brand-accent)]/15"
          title="La mia scheda"
          description="Profilo, band e crediti"
        />
      </section>

      <p className="text-center text-sm italic text-neutral-500">
        La tua passione, il nostro palcoscenico
      </p>
    </div>
  );
}
