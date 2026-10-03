import { notFound } from "next/navigation";

import {
  getPublicBoard,
  getPublicDisplaySettings,
  loadPublicOccupancy,
  loadPublicTimetable,
} from "@musicpro/database";

import { BoardOff, TvBoard, TvOccupancy } from "@/components/tabellone/tv-screen";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TabellonePage({ params }: PageProps) {
  const { id } = await params;
  let client: ReturnType<typeof createServiceRoleClient>;
  let settings: Awaited<ReturnType<typeof getPublicDisplaySettings>>;
  try {
    client = createServiceRoleClient();
    settings = await getPublicDisplaySettings(client);
  } catch (error) {
    console.error(error);
    return <BoardOff unavailable />;
  }
  if (!settings?.enabled) return <BoardOff />;

  const board = await getPublicBoard(client, id);
  if (!board) notFound();

  try {
    if (board.kind === "occupancy") {
      const view = await loadPublicOccupancy(client, board, settings);
      return <TvOccupancy view={view} />;
    }
    const view = await loadPublicTimetable(client, board, settings);
    return <TvBoard view={view} />;
  } catch (error) {
    console.error(error);
    return <BoardOff unavailable />;
  }
}
