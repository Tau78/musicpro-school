import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  hasActiveCourseEnrollment,
  listMyOpenLessonFees,
} from "@musicpro/database";

import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MyLessonFeesPanel } from "@/components/associate/my-lesson-fees-panel";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { LessonsUnavailableNotice } from "@/components/lezioni/lessons-unavailable-notice";
import { canAccessAdmin } from "@/lib/admin/roles";
import { isLessonsModuleEnabled } from "@/lib/lessons-module";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{ pagato?: string }>;
}

export default async function DashboardRettePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member) {
    redirect("/login?error=member_not_linked");
  }

  const lessonsEnabled = isLessonsModuleEnabled();
  const isAllievo = lessonsEnabled
    ? await hasActiveCourseEnrollment(supabase, member.id)
    : false;

  const params = await searchParams;
  const paymentComplete = params.pagato === "1";

  let fees: Awaited<ReturnType<typeof listMyOpenLessonFees>> = [];
  let loadError: string | null = null;

  if (lessonsEnabled && isAllievo) {
    try {
      fees = await listMyOpenLessonFees(supabase, member.id);
    } catch (err) {
      loadError =
        err instanceof Error ? err.message : "Impossibile caricare le rette.";
    }
  }

  const inAdminShell = canAccessAdmin(member.roles);

  const body = (
      <div className={`space-y-5 ${inAdminShell ? "mx-auto max-w-3xl" : ""}`}>
        <div>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-[var(--brand)] hover:underline"
          >
            ← Dashboard
          </Link>
          <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[var(--brand)] sm:text-4xl">
            Le mie rette
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Rette lezioni e quota associativa da saldare
          </p>
        </div>

        {!lessonsEnabled ? <LessonsUnavailableNotice /> : null}

        {lessonsEnabled && !isAllievo ? (
          <div className="glass-card px-5 py-6 text-sm text-neutral-700">
            Questa sezione è per gli allievi con un corso attivo. Se pensi sia un
            errore, contatta la segreteria.
          </div>
        ) : null}

        {loadError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </div>
        ) : null}

        {lessonsEnabled && isAllievo && !loadError ? (
          <MyLessonFeesPanel fees={fees} paymentComplete={paymentComplete} />
        ) : null}
      </div>
  );

  if (inAdminShell) {
    return body;
  }

  return (
    <AssociatePageShell actions={<HeaderSettingsActions />}>
      {body}
    </AssociatePageShell>
  );
}
