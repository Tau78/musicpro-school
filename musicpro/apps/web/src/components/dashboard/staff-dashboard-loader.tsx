import { todayInRome } from "@musicpro/database";

import { StaffDashboardHub } from "@/components/admin/staff-dashboard-hub";
import { StaffUnifiedCalendar } from "@/components/dashboard/staff-unified-calendar";
import { canManageShop } from "@/lib/admin/roles";
import { loadStaffDashboardHub } from "@/lib/dashboard/load-staff-hub";
import { createClient } from "@/lib/supabase/server";
import type { MemberRoleValue } from "@musicpro/shared";

export async function StaffDashboardLoader({
  memberId,
  roles,
  searchParams,
  showBookingsCalendar,
  showStaffLessons,
  showTeacherLessons,
  showUnifiedCalendar,
}: {
  memberId: string;
  roles: MemberRoleValue[];
  searchParams: {
    view?: string;
    date?: string;
    sala?: string;
    docente?: string;
    ambito?: string;
    hl?: string;
  };
  showBookingsCalendar: boolean;
  showStaffLessons: boolean;
  showTeacherLessons: boolean;
  showUnifiedCalendar: boolean;
}) {
  const supabase = await createClient();
  const today = todayInRome();
  const manageShop = canManageShop(roles);

  const hubProps = await loadStaffDashboardHub(supabase, memberId, today, {
    showBookingsCalendar,
    showStaffLessons,
    showTeacherLessons,
    loadCreditsInCirculation: manageShop,
  });

  const calendarParams = {
    view: searchParams.view,
    date: searchParams.date,
    sala: searchParams.sala,
    docente: searchParams.docente,
    ambito: searchParams.ambito,
    hl: searchParams.hl,
  };

  return (
    <StaffDashboardHub
      {...hubProps}
      canManageShop={manageShop}
      today={today}
      embeddedCalendar={
        showUnifiedCalendar ? (
          <StaffUnifiedCalendar
            memberId={memberId}
            searchParams={calendarParams}
            showStaffLessons={showStaffLessons}
            showBookingsCalendar={showBookingsCalendar}
            showTeacherLessons={showTeacherLessons}
            lockTeacherId={
              showTeacherLessons && !showStaffLessons ? memberId : null
            }
          />
        ) : null
      }
    />
  );
}
