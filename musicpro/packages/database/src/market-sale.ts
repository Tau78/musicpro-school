import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";
import type { MarketPayMethod } from "./market";
import { formatEuro } from "./reimbursements";

type Client = SupabaseClient<Database>;

export type SaleLedgerEntry = {
  id: string;
  entryDate: string;
  amountCents: number;
  method: MarketPayMethod | null;
  description: string;
};

const OPEN_LISTING = ["bozza", "in_vendita", "riservato"] as const;

export function romeToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function romeCalendarYear(): number {
  return Number(romeToday().slice(0, 4));
}

export function fixedAssetSaleTitle(asset: {
  name: string;
  brand: string | null;
  model: string | null;
}): string {
  const parts = [asset.brand, asset.name, asset.model]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean);
  const unique: string[] = [];
  for (const part of parts) {
    if (!unique.some((item) => item.toLowerCase() === part.toLowerCase())) {
      unique.push(part);
    }
  }
  const raw = (unique.join(" ") || asset.name).trim().replace(/\s+/g, " ");
  if (raw.length < 1 || raw.length > 120) throw new Error("Nome cespite non valido.");
  return raw;
}

export async function findOpenMarketListingForAsset(
  client: Client,
  assetId: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await client
    .from("market_listings")
    .select("id, status")
    .eq("fixed_asset_id", assetId)
    .in("status", [...OPEN_LISTING])
    .maybeSingle();
  if (error) throw new Error(error.message || "Impossibile leggere l'annuncio.");
  return data;
}

export async function listAssetsOnSale(client: Client): Promise<string[]> {
  const { data, error } = await client
    .from("market_listings")
    .select("fixed_asset_id")
    .in("status", ["bozza", "in_vendita", "riservato"])
    .not("fixed_asset_id", "is", null);
  if (error) throw new Error(error.message || "Impossibile leggere gli annunci.");
  return (data ?? [])
    .map((row) => row.fixed_asset_id)
    .filter((id): id is string => Boolean(id));
}

export async function publishFixedAssetToMarket(
  client: Client,
  assetId: string,
  priceCents: number,
): Promise<{ listingId: string; alreadyListed: boolean; photoStoragePath: string | null }> {
  if (priceCents < 100) throw new Error("Prezzo minimo 1 euro.");

  const existing = await findOpenMarketListingForAsset(client, assetId);
  if (existing) {
    return { listingId: existing.id, alreadyListed: true, photoStoragePath: null };
  }

  const asset = await client
    .from("fixed_assets")
    .select("id, name, brand, model, serial, notes, quantity, disposed_at, deleted_at, photo_storage_path")
    .eq("id", assetId)
    .maybeSingle();
  if (asset.error) throw new Error(asset.error.message);
  if (!asset.data) throw new Error("Cespite non trovato.");
  if (asset.data.deleted_at || asset.data.disposed_at) {
    throw new Error("Questo cespite non è più in inventario.");
  }

  const title = fixedAssetSaleTitle(asset.data);
  const extra = [
    asset.data.serial ? `Seriale ${asset.data.serial}` : "",
    asset.data.notes ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const inserted = await client
    .from("market_listings")
    .insert({
      title,
      description: extra.trim().slice(0, 2000),
      price_cents: priceCents,
      status: "in_vendita",
      fixed_asset_id: assetId,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Error(inserted.error?.message || "Impossibile pubblicare l'annuncio.");
  }

  return {
    listingId: inserted.data.id,
    alreadyListed: false,
    photoStoragePath: asset.data.photo_storage_path,
  };
}

export async function listSaleLedger(
  client: Client,
  year = romeCalendarYear(),
): Promise<SaleLedgerEntry[]> {
  const { data, error } = await client
    .from("association_ledger_entries")
    .select("id, entry_date, amount_cents, method, description")
    .eq("category", "vendita_cespite")
    .gte("entry_date", `${year}-01-01`)
    .lte("entry_date", `${year}-12-31`)
    .order("entry_date", { ascending: false });
  if (error) throw new Error(error.message || "Impossibile leggere il bilancio.");
  return (data ?? []).map((row) => ({
    id: row.id,
    entryDate: row.entry_date,
    amountCents: row.amount_cents,
    method: row.method,
    description: row.description,
  }));
}

export async function recordMarketSale(
  client: Client,
  order: {
    id: string;
    listing_id: string;
    method: MarketPayMethod;
    amount_cents: number;
  },
  actorMemberId?: string | null,
): Promise<void> {
  const listing = await client
    .from("market_listings")
    .select("id, title, fixed_asset_id, seller_kind")
    .eq("id", order.listing_id)
    .maybeSingle();
  if (listing.error) throw new Error(listing.error.message);
  if (!listing.data) throw new Error("Annuncio non trovato.");
  if (listing.data.seller_kind === "associato" || order.method === "tra_privati") return;

  const entryDate = romeToday();
  const methodLabel =
    order.method === "bonifico"
      ? "Bonifico"
      : order.method === "contanti"
        ? "Contanti"
        : "Nexi";
  const amountLabel = formatEuro(order.amount_cents / 100);

  if (listing.data.fixed_asset_id) {
    const asset = await client
      .from("fixed_assets")
      .select("id, quantity, disposed_at, deleted_at")
      .eq("id", listing.data.fixed_asset_id)
      .maybeSingle();
    if (asset.error) throw new Error(asset.error.message);
    if (asset.data && !asset.data.deleted_at) {
      const already = await client
        .from("fixed_asset_events")
        .select("id")
        .eq("asset_id", asset.data.id)
        .eq("event_type", "venduto")
        .ilike("notes", `%${order.id}%`)
        .maybeSingle();
      if (already.error) throw new Error(already.error.message);

      if (!already.data && !asset.data.disposed_at) {
        if (asset.data.quantity > 1) {
          const decreased = await client
            .from("fixed_assets")
            .update({ quantity: asset.data.quantity - 1 })
            .eq("id", asset.data.id)
            .eq("quantity", asset.data.quantity);
          if (decreased.error) throw new Error(decreased.error.message);
        } else {
          const disposed = await client
            .from("fixed_assets")
            .update({
              disposed_at: new Date().toISOString(),
              disposal_kind: "venduto",
            })
            .eq("id", asset.data.id);
          if (disposed.error) throw new Error(disposed.error.message);
        }

        const event = await client.from("fixed_asset_events").insert({
          asset_id: asset.data.id,
          event_type: "venduto",
          event_date: entryDate,
          notes: `Modalità: ${methodLabel}. Importo: ${amountLabel}. Ordine ${order.id}.`,
          created_by: actorMemberId ?? null,
        });
        if (event.error) throw new Error(event.error.message);
      }
    }
  }

  const ledger = await client.from("association_ledger_entries").insert({
    entry_date: entryDate,
    direction: "entrata",
    category: "vendita_cespite",
    amount_cents: order.amount_cents,
    method: order.method,
    description: listing.data.title,
    fixed_asset_id: listing.data.fixed_asset_id,
    market_order_id: order.id,
  });
  if (ledger.error && ledger.error.code !== "23505") {
    throw new Error(ledger.error.message || "Impossibile registrare l'entrata.");
  }
}
