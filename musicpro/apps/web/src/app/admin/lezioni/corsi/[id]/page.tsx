import { notFound, redirect } from "next/navigation";

import { getCourse, listRooms } from "@musicpro/database";
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

  const [course, lessons, rooms] = await Promise.all([
    getCourse(supabase, id),
    loadCourseLessons(supabase, id),
    listRooms(supabase),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <CourseDetailView
      course={course}
      lessons={lessons}
      roomsById={roomsByIdFromList(rooms)}
      backHref="/admin/lezioni/corsi"
      pendingNote
    />
  );
}
