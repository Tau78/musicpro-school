import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

export type LastMinuteSaleRow = {
  id: string;
  created_at: string;
  start_at: string;
  end_at: string;
  total_price_eur: number | null;
  status: string;
  room_id: string;
  room_name: string;
  member_id: string;
  member_label: string;
  campaign_id: string;
  campaign_phase: string | null;
};

export async function listLastMinuteAttributedBookings(
  client: SupabaseClient<Database>,
  options: { from: string; to: string },
): Promise<LastMinuteSaleRow[]> {
  const fromIso = `${options.from}T00:00:00.000Z`;
  const toExclusive = new Date(`${options.to}T12:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const toIso = toExclusive.toISOString();

  const { data: bookings, error } = await client
    .from("bookings")
    .select(
      "id, created_at, start_at, end_at, total_price_eur, status, room_id, member_id, last_minute_campaign_id",
    )
    .not("last_minute_campaign_id", "is", null)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = bookings ?? [];
  if (rows.length === 0) return [];

  const roomIds = [...new Set(rows.map((r) => r.room_id as string))];
  const memberIds = [...new Set(rows.map((r) => r.member_id as string))];
  const campaignIds = [
    ...new Set(
      rows
        .map((r) => r.last_minute_campaign_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [roomsRes, membersRes, campaignsRes] = await Promise.all([
    client.from("rooms").select("id, name").in("id", roomIds),
    client
      .from("members")
      .select("id, first_name, last_name, email")
      .in("id", memberIds),
    client
      .from("last_minute_campaigns")
      .select("id, phase")
      .in("id", campaignIds),
  ]);

  if (roomsRes.error) throw new Error(roomsRes.error.message);
  if (membersRes.error) throw new Error(membersRes.error.message);
  if (campaignsRes.error) throw new Error(campaignsRes.error.message);

  const roomName = new Map(
    (roomsRes.data ?? []).map((r) => [r.id as string, String(r.name ?? "—")]),
  );
  const memberById = new Map(
    (membersRes.data ?? []).map((m) => [m.id as string, m]),
  );
  const campaignPhase = new Map(
    (campaignsRes.data ?? []).map((c) => [
      c.id as string,
      String(c.phase ?? ""),
    ]),
  );

  return rows.map((row) => {
    const member = memberById.get(row.member_id as string);
    const first = String(member?.first_name ?? "").trim();
    const last = String(member?.last_name ?? "").trim();
    const name = [first, last].filter(Boolean).join(" ");
    const memberLabel =
      name ||
      String(member?.email ?? "").trim() ||
      (row.member_id as string).slice(0, 8);
    const campaignId = row.last_minute_campaign_id as string;

    return {
      id: row.id as string,
      created_at: row.created_at as string,
      start_at: row.start_at as string,
      end_at: row.end_at as string,
      total_price_eur:
        typeof row.total_price_eur === "number" ? row.total_price_eur : null,
      status: String(row.status ?? ""),
      room_id: row.room_id as string,
      room_name: roomName.get(row.room_id as string) ?? "—",
      member_id: row.member_id as string,
      member_label: memberLabel,
      campaign_id: campaignId,
      campaign_phase: campaignPhase.get(campaignId) ?? null,
    };
  });
}