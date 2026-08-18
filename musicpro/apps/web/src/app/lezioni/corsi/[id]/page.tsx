import { notFound, redirect } from "next/navigation";

import {
  getCourse,
  getCurrentMemberWithRoles,
  getTeacherProfile,
  listRooms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { CourseDetailView } from "@/components/lezioni/course-detail-view";
import {
  loadCourseLessons,
  roomsByIdFromList,
} from "@/components/lezioni/load-course-page-data";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CorsoDocenteDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getCurrentMemberWithRoles(supabase);

  if (!member?.roles.includes(MemberRole.Docente)) {
    redirect("/lezioni");
  }

  const [course, lessons, rooms, profile] = await Promise.all([
    getCourse(supabase, id),
    loadCourseLessons(supabase, id),
    listRooms(supabase),
    getTeacherProfile(supabase, member.id),
  ]);

  if (!course) {
    notFound();
  }

  return (
    <CourseDetailView
      course={course}
      lessons={lessons}
      roomsById={roomsByIdFromList(rooms)}
      rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
      backHref="/lezioni/corsi"
      actorMemberId={member.id}
      isStaff={false}
      showPrice={profile?.paymentVisibility !== "hidden"}
      canCreateCourses={profile?.canCreateCourses ?? false}
    />
  );
}
