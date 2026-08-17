import { notFound, redirect } from "next/navigation";

import {
  acceptBandInvite,
  getBandInviteByToken,
  getCurrentMemberWithRoles,
} from "@musicpro/database";

import { getMembershipStatus } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

import { InvitePageClient } from "./invite-page-client";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const supabase = await createClient();
  const invite = await getBandInviteByToken(supabase, token);

  if (!invite) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <InvitePageClient
        token={token}
        bandName={invite.bandName}
        inviteEmail={invite.email}
        isLoggedIn={false}
        expired={invite.expired}
      />
    );
  }

  const member = await getCurrentMemberWithRoles(supabase);
  if (!member) {
    redirect(`/login?redirect=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const membership = await getMembershipStatus(supabase, member.id);

  if (!membership.formCompleted) {
    redirect(`/onboarding/form?invite=${encodeURIComponent(token)}`);
  }

  if (!membership.quotaPaid) {
    redirect(`/onboarding/quota?invite=${encodeURIComponent(token)}`);
  }

  if (!invite.expired && invite.status === "pending") {
    const result = await acceptBandInvite(supabase, token);

    if (result.success && result.bandId) {
      redirect(`/dashboard/band/${result.bandId}`);
    }
  }

  return (
    <InvitePageClient
      token={token}
      bandName={invite.bandName}
      inviteEmail={invite.email}
      isLoggedIn
      expired={invite.expired}
    />
  );
}
