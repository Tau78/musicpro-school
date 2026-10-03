import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getPublicDisplaySettings,
  listPublicBoards,
  layoutLabel,
} from "@musicpro/database";

import { BoardOff } from "@/components/tabellone/tv-screen";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export default async function TabelloneIndexPage() {
  let settings: Awaited<ReturnType<typeof getPublicDisplaySettings>>;
  try {
    settings = await getPublicDisplaySettings(createServiceRoleClient());
  } catch (error) {
    console.error(error);
    return <BoardOff unavailable />;
  }
  if (!settings?.enabled) return <BoardOff />;

  const boards = await listPublicBoards(createServiceRoleClient());
  const timetables = boards.filter((board) => board.kind === "timetable");
  if (timetables.length === 1 && boards.length === 1) {
    redirect(`/tabellone/${timetables[0]!.id}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-3 bg-black px-6 py-10 text-amber-50">
      <p className="text-xs tracking-[0.3em] text-amber-400">{settings.siteLabel}</p>
      <h1 className="text-2xl font-semibold">Scegli il tabellone</h1>
      <ul className="mt-2 divide-y divide-amber-500/20 border-y border-amber-500/20">
        {boards.map((board) => (
          <li key={board.id}>
            <Link
              href={`/tabellone/${board.id}`}
              className="flex items-baseline justify-between gap-4 py-4 text-lg"
            >
              <span>{board.name}</span>
              <span className="text-sm text-amber-400/80">
                {board.kind === "occupancy" ? "Aule" : layoutLabel(board.layout)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
