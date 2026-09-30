"use client";

import Link from "next/link";

import type { MyBandSummary } from "@musicpro/database";

import { MemberQuotaAlert } from "@/components/associate/member-quota-alert";
import type { MembershipStatus } from "@/lib/membership";

interface BandSelectStepProps {
  bands: MyBandSummary[];
  selectedBandId: string;
  onSelectBand: (bandId: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  quotaStatus?: Pick<
    MembershipStatus,
    "fiscalYear" | "formCompleted" | "quotaPaid" | "quotaAmountEur"
  > | null;
}

export function BandSelectStep({
  bands,
  selectedBandId,
  onSelectBand,
  onContinue,
  onBack,
  quotaStatus = null,
}: BandSelectStepProps) {
  const activeBands = bands.filter((band) => band.myStatus === "active");
  const bookableBands = activeBands.filter((band) => band.allQuotaOk);
  const blockedByMemberQuota =
    activeBands.length > 0 &&
    bookableBands.length === 0 &&
    quotaStatus &&
    !quotaStatus.quotaPaid;
  const blockedByBandQuota =
    activeBands.length > 0 &&
    bookableBands.length === 0 &&
    !blockedByMemberQuota;

  return (
    <section className="space-y-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-medium text-[var(--brand)]">
          Seleziona band
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Scegli la band per cui stai prenotando la sala prova.
        </p>
      </div>

      {bookableBands.length === 0 ? (
        <div className="space-y-3">
          {blockedByMemberQuota && quotaStatus ? (
            <MemberQuotaAlert {...quotaStatus} />
          ) : null}
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-sm text-neutral-700">
            <p className="font-medium">Nessuna band prenotabile</p>
            {blockedByMemberQuota ? (
              <p className="mt-2">
                Versa la quota associativa per sbloccare le prenotazioni in
                band.
              </p>
            ) : blockedByBandQuota ? (
              <p className="mt-2">
                Uno o più membri attivi non hanno la quota in regola. Apri la
                band e verifica chi deve versare.
              </p>
            ) : (
              <p className="mt-2">
                Crea una band o completa iscrizione e quota dei membri dalla
                sezione band in dashboard.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!quotaStatus?.quotaPaid ? (
                <Link
                  href="/onboarding/quota"
                  className="inline-flex rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--brand)]/90"
                >
                  Quota associativa
                </Link>
              ) : null}
              <Link
                href="/dashboard/band"
                className="inline-flex rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
              >
                Le mie band
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <ul className="grid gap-2">
          {bookableBands.map((band) => {
            const selected = band.id === selectedBandId;

            return (
              <li key={band.id}>
                <button
                  type="button"
                  onClick={() => onSelectBand(band.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-neutral-200 hover:border-[var(--brand)]"
                  }`}
                >
                  <span className="font-medium">{band.name}</span>
                  <span className="mt-1 block text-xs text-neutral-600">
                    {band.activeMemberCount} membri attivi
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!selectedBandId || bookableBands.length === 0}
          onClick={onContinue}
          className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--brand)]/90 disabled:opacity-60"
        >
          Continua
        </button>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm"
          >
            Indietro
          </button>
        ) : null}
      </div>
    </section>
  );
}
