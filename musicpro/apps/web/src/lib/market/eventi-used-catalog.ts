import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { MarketListing } from "@musicpro/database";

export type EventiUsedMarketRow = {
  id: string;
  title: string;
  description?: string | null;
  price_cents: number;
  cover_url?: string | null;
  photos?: string[] | null;
  category_label?: string | null;
  condition_label?: string | null;
};

function eventiClient(): SupabaseClient | null {
  const url = (process.env.EVENTI_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = (process.env.EVENTI_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let loggedMissing = false;

function logMissingOnce(): void {
  if (loggedMissing) return;
  loggedMissing = true;
  console.warn(
    "[school-market] EVENTI_SUPABASE_URL / EVENTI_SUPABASE_SERVICE_ROLE_KEY assenti — annunci ufficio da eventi.musicproeventi.it non caricati.",
  );
}

export async function listEventiUsedMarketRows(): Promise<EventiUsedMarketRow[]> {
  const client = eventiClient();
  if (!client) {
    logMissingOnce();
    return [];
  }
  const { data, error } = await client.rpc("school_used_market_catalog");
  if (error || !data || data.success !== true) {
    if (error) {
      console.warn("[school-market] catalogo Eventi non disponibile:", error.message);
    }
    return [];
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return items.filter(
    (row: unknown): row is EventiUsedMarketRow =>
      Boolean(row && typeof row === "object" && typeof (row as EventiUsedMarketRow).id === "string"),
  );
}

export function mapEventiUsedRowToListing(row: EventiUsedMarketRow): MarketListing {
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
  const cover = row.cover_url || photos[0] || null;
  return {
    id: `eventi-used:${row.id}`,
    title: row.title,
    description: row.description ?? "",
    priceCents: Number(row.price_cents) || 0,
    status: "in_vendita",
    photoPath: null,
    photoUrl: cover,
    createdAt: new Date().toISOString(),
    sellerKind: "associazione",
    sellerMemberId: null,
    sellerName: null,
    sellerPhone: null,
    sellerEmail: null,
    handover: "sede",
    fixedAssetId: null,
    categoryLabel: row.category_label ?? null,
    conditionLabel: row.condition_label ?? null,
    source: "eventi_desk",
  };
}

export async function listEventiUsedMarketListings(): Promise<MarketListing[]> {
  const rows = await listEventiUsedMarketRows();
  return rows.map(mapEventiUsedRowToListing);
}
