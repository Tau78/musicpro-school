import { notFound, redirect } from "next/navigation";

import { getAdminRoomById } from "@musicpro/database";

import {
  RoomsSettingsWorkspace,
} from "@/components/admin/rooms-settings-workspace";
import { parseRoomTab } from "@/lib/admin/room-tabs";
import { getAdminMember } from "@/lib/admin/current-member";
import { canManageRooms } from "@/lib/admin/roles";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function SalaDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const currentMember = await getAdminMember();

  if (!currentMember || !canManageRooms(currentMember.roles)) {
    redirect("/admin/rimborsi");
  }

  const room = await getAdminRoomById(supabase, id);

  if (!room) {
    notFound();
  }

  return (
    <RoomsSettingsWorkspace
      room={room}
      initialTab={parseRoomTab(tab)}
    />
  );
}
