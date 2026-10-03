"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

function StatTile({
  label,
  count,
  href,
  tone = "neutral",
}: {
  label: string;
  count: number;
  href: string;
  tone?: "neutral" | "amber" | "brand";
}) {
  const countClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "brand"
        ? "text-[var(--brand)]"
        : "text-neutral-900";
  const borderClass =
    count > 0 && tone === "amber"
      ? "border-amber-200 bg-amber-50/50 hover:border-amber-300"
      : "border-neutral-200 bg-white hover:border-[var(--brand)]/25";

  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-3 transition ${borderClass}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${countClass}`}>
        {count}
      </p>
    </Link>
  );
}

export function LessonsCodaPlanciaHeader({
  pendingCount,
  unplacedCount,
  changeCount,
  advanceCount,
  closeCount,
}: {
  pendingCount: number;
  unplacedCount: number;
  changeCount: number;
  advanceCount: number;
  closeCount: number;
}) {
  const openTotal =
    pendingCount + unplacedCount + changeCount + advanceCount + closeCount;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--brand)]">
          Da fare
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Plancia operativa: approva corsi, calendarizza lezioni, gestisci
          richieste e anticipi.{" "}
          {openTotal > 0 ? (
            <span className="font-medium text-amber-800">
              {openTotal} {openTotal === 1 ? "voce aperta" : "voci aperte"}.
            </span>
          ) : (
            <span className="text-neutral-500">Nessuna voce urgente.</span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        <StatTile
          label="Anticipi"
          count={advanceCount}
          href="#coda-anticipi"
          tone={advanceCount > 0 ? "amber" : "neutral"}
        />
        <StatTile
          label="Chiusure"
          count={closeCount}
          href="#coda-chiusure"
          tone={closeCount > 0 ? "amber" : "neutral"}
        />
        <StatTile
          label="Da approvare"
          count={pendingCount}
          href="#coda-approvare"
          tone={pendingCount > 0 ? "brand" : "neutral"}
        />
        <StatTile
          label="In calendario"
          count={unplacedCount}
          href="#coda-calendario"
          tone={unplacedCount > 0 ? "brand" : "neutral"}
        />
        <StatTile
          label="Spostamenti"
          count={changeCount}
          href="#coda-spostamenti"
          tone={changeCount > 0 ? "amber" : "neutral"}
        />
      </div>
    </div>
  );
}

export function LessonsCodaSection({
  id,
  title,
  count,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0);
  const titleLabel = count > 0 ? `${title} (${count})` : title;

  return (
    <section
      id={id}
      className="scroll-mt-24 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left touch-manipulation hover:bg-neutral-50"
      >
        <span className="text-base font-semibold text-[var(--brand)]">
          {titleLabel}
        </span>
        <span
          aria-hidden
          className={`text-xs text-neutral-400 transition ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div className="border-t border-neutral-100 px-4 py-4">{children}</div>
      ) : null}
    </section>
  );
}
