import { redirect } from "next/navigation";

import { getCurrentMemberWithRoles } from "@musicpro/database";

import { getMembershipStatus } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingHubPage() {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?redirect=/onboarding");
  }

  const status = await getMembershipStatus(supabase, member.id);

  if (status.isComplete) {
    redirect("/dashboard");
  }

  if (!status.formCompleted) {
    redirect("/onboarding/form");
  }

  if (!status.quotaPaid) {
    redirect("/onboarding/quota");
  }

  redirect("/dashboard");
}
