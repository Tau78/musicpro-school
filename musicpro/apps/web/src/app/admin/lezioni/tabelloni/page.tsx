import { redirect } from "next/navigation";

import {
  getPublicDisplaySettings,
  listPublicBoards,
  listRooms,
} from "@musicpro/database";
import { MemberRole } from "@musicpro/shared";

import { BoardsAdmin } from "@/components/tabellone/boards-admin";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageMembers } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminTabelloniPage() {
  const supabase = await createClient();
  const member = await getAdminMember();

  if (!member || !canManageMembers(member.roles)) {
    redirect(
      member?.roles.includes(MemberRole.Docente) ? "/lezioni" : "/admin/rimborsi",
    );
  }

  let settings: Awaited<ReturnType<typeof getPublicDisplaySettings>> = null;
  let boards: Awaited<ReturnType<typeof listPublicBoards>> = [];
  let rooms: Awaited<ReturnType<typeof listRooms>> = [];
  try {
    [settings, boards, rooms] = await Promise.all([
      getPublicDisplaySettings(supabase),
      listPublicBoards(supabase),
      listRooms(supabase),
    ]);
  } catch (error) {
    console.error(error);
    settings = null;
  }

  if (!settings) {
    return (
      <p className="text-sm text-neutral-600">
        I tabelloni non sono ancora disponibili su questo database.
      </p>
    );
  }

  return (
    <BoardsAdmin
      settings={settings}
      boards={boards}
      roomNames={Object.fromEntries(rooms.map((room) => [room.id, room.name]))}
    />
  );
}
