"use client";

import Link from "next/link";

import type { MyBandSummary } from "@musicpro/database";

interface BandCardProps {
  band: MyBandSummary;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  pending_invite: "Invito in sospeso",
  pending_quota: "Quota da versare",
  expired: "Quota scaduta",
};

export function BandCard({ band }: BandCardProps) {
  const statusLabel = STATUS_LABELS[band.myStatus] ?? band.myStatus;

  return (
    <Link
      href={`/dashboard/band/${band.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-[var(--brand)] hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--brand)]">
            {band.name}
          </h3>
          <p className="mt-1 text-sm text-neutral-600">
            {band.memberCount}{" "}
            {band.memberCount === 1 ? "membro" : "membri"}
            {band.myRole === "founder" ? " · Founder" : null}
            {!band.allQuotaOk ? " · Quota incompleta" : null}
          </p>
        </div>
        <span className="rounded-full bg-[var(--brand)]/10 px-2.5 py-1 text-xs font-medium text-[var(--brand)]">
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}
