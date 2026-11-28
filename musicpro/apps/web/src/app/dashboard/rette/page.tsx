import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getCurrentMemberWithRoles,
  hasActiveCourseEnrollment,
  listMyEnrollmentWallets,
  listMyOpenLessonFees,
} from "@musicpro/database";

import type { PrepaidPackRow } from "@/components/associate/my-lesson-fees-panel";

import { AssociatePageShell } from "@/components/associate/associate-page-shell";
import { MyLessonFeesPanel } from "@/components/associate/my-lesson-fees-panel";
import { HeaderSettingsActions } from "@/components/dashboard/header-settings-actions";
import { LessonsUnavailableNotice } from "@/components/lezioni/lessons-unavailable-notice";
import { canAccessAdmin } from "@/lib/admin/roles";
import { redirectForUiView } from "@/lib/admin/ui-view.server";
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

  const ui = await redirectForUiView(member.roles, "/dashboard/rette");

  const lessonsEnabled = isLessonsModuleEnabled();
  const isAllievo = lessonsEnabled
    ? await hasActiveCourseEnrollment(supabase, member.id)
    : false;

  const params = await searchParams;
  const paymentComplete = params.pagato === "1";

  let fees: Awaited<ReturnType<typeof listMyOpenLessonFees>> = [];
  let prepaidPacks: PrepaidPackRow[] = [];
  let loadError: string | null = null;

  if (lessonsEnabled && isAllievo) {
    try {
      fees = await listMyOpenLessonFees(supabase, member.id);

      const wallets = await listMyEnrollmentWallets(supabase);
      const courseIds = [...new Set(wallets.map((w) => w.courseId))];
      const memberIds = [...new Set(wallets.map((w) => w.memberId))];
      const openPackEnrollmentIds = new Set(
        fees
          .filter((f) => f.kind === "pack" && f.courseEnrollmentId)
          .map((f) => f.courseEnrollmentId as string),
      );

      const [coursesRes, membersRes] = await Promise.all([
        courseIds.length > 0
          ? supabase
              .from("courses")
              .select("id, is_trial, price_eur, status")
              .in("id", courseIds)
          : Promise.resolve({ data: [], error: null }),
        memberIds.length > 0
          ? supabase
              .from("members")
              .select("id, first_name, last_name")
              .in("id", memberIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (coursesRes.error) {
        throw new Error(
          coursesRes.error.message || "Impossibile caricare i corsi.",
        );
      }
      if (membersRes.error) {
        throw new Error(
          membersRes.error.message || "Impossibile caricare gli allievi.",
        );
      }

      const courseById = new Map(
        (coursesRes.data ?? []).map((row) => [row.id, row]),
      );
      const memberLabelById = new Map(
        (membersRes.data ?? []).map((row) => [
          row.id,
          `${row.last_name ?? ""} ${row.first_name ?? ""}`.trim(),
        ]),
      );
      const multiStudent = memberIds.length > 1;

      prepaidPacks = wallets
        .filter((w) => {
          const course = courseById.get(w.courseId);
          if (!course || course.is_trial || course.status !== "attivo") {
            return false;
          }
          const price = Number(course.price_eur ?? 0);
          if (!Number.isFinite(price) || price <= 0) return false;
          if (w.balance <= 0) return false;
          if (openPackEnrollmentIds.has(w.enrollmentId)) return false;
          return true;
        })
        .map((w) => ({
          enrollmentId: w.enrollmentId,
          memberId: w.memberId,
          courseName: w.courseName,
          balance: w.balance,
          studentLabel: multiStudent
            ? memberLabelById.get(w.memberId) || undefined
            : undefined,
        }));
    } catch (err) {
      loadError =
        err instanceof Error ? err.message : "Impossibile caricare le rette.";
    }
  }

  const inAdminShell = canAccessAdmin(ui.roles);

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
          <MyLessonFeesPanel
            fees={fees}
            prepaidPacks={prepaidPacks}
            paymentComplete={paymentComplete}
          />
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
