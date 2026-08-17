import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  currentFiscalYear,
  getBand,
  getCurrentMemberWithRoles,
  listAnnualQuotaSettings,
  listBandMembers,
} from "@musicpro/database";
import { APP_NAME } from "@musicpro/shared";

import { BandInviteForm } from "@/components/band/band-invite-form";
import { BandLeaveButton } from "@/components/band/band-leave-button";
import { BandMemberList } from "@/components/band/band-member-list";
import {
  QuotaPayForMembers,
  type BandMemberQuotaOption,
} from "@/components/band/quota-pay-for-members";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

interface BandDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BandDetailPage({ params }: BandDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const fiscalYear = currentFiscalYear();

  const [band, members, settings] = await Promise.all([
    getBand(supabase, id),
    listBandMembers(supabase, id),
    listAnnualQuotaSettings(supabase),
  ]);

  const myMembership = members.find((entry) => entry.memberId === member.id);
  if (!band || !myMembership) {
    notFound();
  }

  const quotaAmountEur =
    settings.find((entry) => entry.fiscalYear === fiscalYear)?.amountEur ?? 15;

  const quotaChecks = await Promise.all(
    members.map(async (entry) => {
      const { data } = await supabase.rpc("member_quota_ok", {
        p_member_id: entry.memberId,
        p_fiscal_year: fiscalYear,
      });

      return {
        memberId: entry.memberId,
        quotaPaid: Boolean(data),
      };
    }),
  );

  const quotaPaidByMemberId = new Map(
    quotaChecks.map((entry) => [entry.memberId, entry.quotaPaid]),
  );

  const membersWithoutQuota: BandMemberQuotaOption[] = members
    .filter((entry) => !quotaPaidByMemberId.get(entry.memberId))
    .map((entry) => ({
      memberId: entry.memberId,
      displayName: entry.member
        ? `${entry.member.firstName} ${entry.member.lastName}`.trim()
        : entry.invitedEmail ?? "Membro",
      email: entry.member?.email ?? entry.invitedEmail,
      quotaAmountEur,
    }));

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-sm font-medium text-[var(--brand-accent)]">
              {APP_NAME}
            </p>
            <h1 className="text-xl font-semibold text-[var(--brand)]">
              {band.name}
            </h1>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/dashboard/band"
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          ← Torna alle band
        </Link>

        <section className="mt-8">
          <h2 className="text-lg font-medium text-[var(--brand)]">Membri</h2>
          <p className="mt-2 text-sm text-neutral-600">
            {members.length}{" "}
            {members.length === 1 ? "membro" : "membri"}
            {myMembership.role === "founder" ? " · Sei il founder" : null}
          </p>
          <div className="mt-4">
            <BandMemberList members={members} />
          </div>
        </section>

        {membersWithoutQuota.length > 0 ? (
          <section className="mt-8">
            <QuotaPayForMembers
              bandId={band.id}
              fiscalYear={fiscalYear}
              members={membersWithoutQuota}
            />
          </section>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <BandInviteForm bandId={band.id} />
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-lg font-medium text-[var(--brand)]">
              Abbandona band
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Puoi uscire dalla band in qualsiasi momento. Il founder non può
              abbandonare finché ci sono altri membri attivi.
            </p>
            <div className="mt-4">
              <BandLeaveButton bandId={band.id} bandName={band.name} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
