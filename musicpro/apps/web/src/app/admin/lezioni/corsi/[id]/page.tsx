import { notFound, redirect } from "next/navigation";

import {
  getCourse,
  listMemberIdsWithRole,
  listMembers,
  listRooms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseDetailView } from "@/components/lezioni/course-detail-view";
import {
  loadCourseLessons,
  roomsByIdFromList,
} from "@/components/lezioni/load-course-page-data";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCorsoDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente)
        ? `/lezioni/corsi/${id}`
        : "/admin/rimborsi",
    );
  }

  const [course, lessons, rooms, docenteIds, members] = await Promise.all([
    getCourse(supabase, id),
    loadCourseLessons(supabase, id),
    listRooms(supabase),
    listMemberIdsWithRole(supabase, MemberRole.Docente),
    listMembers(supabase),
  ]);

  if (!course) {
    notFound();
  }

  const docenteIdSet = new Set(docenteIds);
  const teachers = members
    .filter((row) => docenteIdSet.has(row.id))
    .map((row) => ({
      id: row.id,
      label: `${row.lastName} ${row.firstName}`.trim(),
    }));

  return (
    <CourseDetailView
      course={course}
      lessons={lessons}
      roomsById={roomsByIdFromList(rooms)}
      rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
      backHref="/admin/lezioni/corsi"
      pendingNote
      isStaff
      showPrice
      actorMemberId={member.id}
      canCreateCourses
      canReschedule
      teachers={teachers}
    />
  );
}
