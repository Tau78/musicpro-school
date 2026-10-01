import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  getMemberById,
  getMemberCreditBalance,
  getMemberRoles,
  getTeacherDefaultTutorId,
  getTeacherProfile,
  listAnnualQuotaSettings,
  listLessonSubjects,
  listMemberAnnualQuotas,
  listMemberCreditTransactions,
  listPayRateTypes,
  listTeacherAvailability,
  listTeacherPayRates,
  listTeacherSubjects,
  listTeacherTimeOff,
  listTeacherTutorChoices,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { MemberCreditsPanel } from "@/components/admin/member-credits-panel";
import { MemberForm } from "@/components/admin/member-form";
import { MemberRolesPanel } from "@/components/admin/member-roles-panel";
import { TeacherDidacticPanel } from "@/components/admin/teacher-didactic-panel";
import { TeacherAvailabilityPanel } from "@/components/lezioni/teacher-availability-panel";
import { getAdminMember } from "@/lib/admin/current-member";
import {
  canDeleteMembers,
  canManageMembers,
} from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AssociatoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const currentMember = await getAdminMember();

  if (!currentMember || !canManageMembers(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const member = await getMemberById(supabase, id);

  if (!member) {
    notFound();
  }

  const [
    creditBalance,
    creditTransactions,
    quotas,
    quotaSettings,
    roles,
    teacherProfile,
    teacherSubjects,
    teacherRates,
    subjects,
    payRateTypes,
  ] = await Promise.all([
    getMemberCreditBalance(supabase, id),
    listMemberCreditTransactions(supabase, id),
    listMemberAnnualQuotas(supabase, { memberId: id }),
    listAnnualQuotaSettings(supabase),
    getMemberRoles(supabase, id),
    getTeacherProfile(supabase, id),
    listTeacherSubjects(supabase, id),
    listTeacherPayRates(supabase, id),
    listLessonSubjects(supabase),
    listPayRateTypes(supabase),
  ]);

  const hasDocenteRole = roles.includes(MemberRole.Docente);

  const [availabilitySlots, timeOff, lessonSettings, tutorChoices, initialTutorId] =
    hasDocenteRole
      ? await Promise.all([
          listTeacherAvailability(supabase, id),
          listTeacherTimeOff(supabase, id),
          getLessonSchoolSettings(supabase),
          listTeacherTutorChoices(supabase),
          getTeacherDefaultTutorId(supabase, id),
        ])
      : [[], [], null, [], null];

  return (
    <div className="pb-2">
      <div className="mb-4 sm:mb-6">
        <Link
          href="/admin/associati"
          className="text-sm text-[var(--brand)] hover:underline"
        >
          ← Torna alla rubrica
        </Link>
        <h2 className="mt-2 text-xl font-semibold text-[var(--brand)] sm:text-2xl">
          {member.lastName} {member.firstName}
        </h2>
        {member.isEnrollmentDraft ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Bozza anagrafica — scade il{" "}
            {member.draftExpiresAt
              ? new Date(member.draftExpiresAt).toLocaleDateString("it-IT", {
                  timeZone: "Europe/Rome",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : "—"}{" "}
            (30g)
          </p>
        ) : null}
      </div>

      <MemberRolesPanel
        memberId={member.id}
        initialRoles={roles}
        currentStaffMemberId={currentMember.id}
        currentStaffRoles={currentMember.roles}
      />

      <MemberForm
        member={member}
        canDelete={canDeleteMembers(currentMember.roles)}
        quotas={quotas}
        quotaSettings={quotaSettings}
      />

      {hasDocenteRole ? (
        <TeacherDidacticPanel
          memberId={member.id}
          initialProfile={teacherProfile}
          initialSubjectIds={teacherSubjects.map((row) => row.subjectId)}
          initialRates={teacherRates}
          subjects={subjects}
          payRateTypes={payRateTypes}
          tutorChoices={tutorChoices}
          initialTutorId={initialTutorId}
          hasDocenteRole={hasDocenteRole}
          currentStaffMemberId={currentMember.id}
        />
      ) : null}

      {hasDocenteRole ? (
        <section className="mt-10">
          <h3 className="mb-6 text-lg font-semibold text-[var(--brand)]">
            Disponibilità
          </h3>
          <TeacherAvailabilityPanel
            memberId={member.id}
            initialSlots={availabilitySlots}
            initialTimeOff={timeOff}
            sundayVisible={lessonSettings?.sundayVisible ?? false}
            gridOpenMinute={lessonSettings?.gridOpenMinute ?? 600}
            gridCloseMinute={lessonSettings?.gridCloseMinute ?? 1380}
          />
        </section>
      ) : null}

      <MemberCreditsPanel
        memberId={member.id}
        initialBalance={creditBalance}
        initialTransactions={creditTransactions}
      />
    </div>
  );
}
