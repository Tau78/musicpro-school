import { redirect } from "next/navigation";

import {
  getLessonSchoolSettings,
  listLessonsInRange,
  listMemberIdsWithRole,
  listMembers,
  listRooms,
  todayInRome,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { LessonsCalendarPage } from "@/components/lezioni/lessons-calendar-page";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import {
  isIsoDate,
  monthBounds,
  parseCalendarMode,
  parseCalendarView,
  weekBounds,
} from "@/lib/lezioni/calendar-range";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    view?: string;
    date?: string;
    docente?: string;
    sala?: string;
    modo?: string;
    hl?: string;
  }>;
}

export default async function AdminLezioniCalendarioPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? "/lezioni/calendario"
        : "/admin/rimborsi",
    );
  }

  const params = await searchParams;
  const today = todayInRome();
  const view = parseCalendarView(params.view);
  const mode = parseCalendarMode(params.modo);
  const anchorDate = isIsoDate(params.date) ? params.date : today;
  const highlightDay = isIsoDate(params.hl) ? params.hl : null;

  const [settings, rooms, docenteIds, members] = await Promise.all([
    getLessonSchoolSettings(supabase),
    listRooms(supabase),
    listMemberIdsWithRole(supabase, MemberRole.Docente),
    listMembers(supabase),
  ]);

  const docenteIdSet = new Set(docenteIds);
  const teachers = members
    .filter((row) => docenteIdSet.has(row.id))
    .map((row) => ({
      id: row.id,
      label: `${row.lastName} ${row.firstName}`.trim(),
    }));

  const roomOptions = rooms.map((room) => ({ id: room.id, name: room.name }));
  const teacherId =
    params.docente && teachers.some((row) => row.id === params.docente)
      ? params.docente
      : null;
  const roomId =
    params.sala && roomOptions.some((row) => row.id === params.sala)
      ? params.sala
      : null;

  const sundayVisible = settings?.sundayVisible ?? false;
  const bounds =
    view === "month"
      ? monthBounds(anchorDate)
      : weekBounds(anchorDate, sundayVisible);

  const lessons = await listLessonsInRange(supabase, {
    from: bounds.from,
    to: bounds.to,
    includePendingHold: true,
    titularMemberId:
      mode === "docente" && teacherId ? teacherId : undefined,
    roomId: mode === "sala" && roomId ? roomId : undefined,
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-[var(--brand)]">
          Calendario
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Tutte le lezioni, per docente o per sala.
        </p>
      </div>

      <LessonsCalendarPage
        initialLessons={lessons}
        settings={{
          sundayVisible,
          gridOpenMinute: settings?.gridOpenMinute ?? 600,
          gridCloseMinute: settings?.gridCloseMinute ?? 1380,
        }}
        rooms={roomOptions}
        teachers={teachers}
        initialTeacherId={teacherId}
        initialRoomId={roomId}
        initialView={view}
        initialDate={anchorDate}
        initialMode={mode}
        isStaff
        canDrag
        courseDetailBasePath="/admin/lezioni/corsi"
        today={today}
        highlightDay={highlightDay}
        memberId={member.id}
      />
    </div>
  );
}
