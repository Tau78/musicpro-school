import { notFound, redirect } from "next/navigation";

import {
  getPublicBoard,
  getPublicDisplaySettings,
  listRooms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { BoardEditor } from "@/components/tabellone/board-editor";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTabellonePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente) ? "/lezioni" : "/admin/rimborsi",
    );
  }

  const [board, settings, rooms] = await Promise.all([
    getPublicBoard(supabase, id),
    getPublicDisplaySettings(supabase),
    listRooms(supabase),
  ]);
  if (!board) notFound();

  return (
    <BoardEditor
      board={board}
      siteLabel={settings?.siteLabel ?? "MusicPro"}
      rooms={rooms.map((room) => ({ id: room.id, name: room.name }))}
    />
  );
}
