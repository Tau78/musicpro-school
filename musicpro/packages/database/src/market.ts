import type { SupabaseClient } from "@supabase/supabase-js";

import { recordMarketSale } from "./market-sale";
import type { Database } from "./types/database";

type MarketClient = SupabaseClient<Database>;

export const MARKET_LISTING_STATUSES = [
  "bozza",
  "in_revisione",
  "rifiutato",
  "in_vendita",
  "riservato",
  "venduto",
] as const;

export type MarketListingStatus = (typeof MARKET_LISTING_STATUSES)[number];

export const MARKET_PAY_METHODS = ["bonifico", "contanti", "nexi", "tra_privati"] as const;

export const MARKET_SELLER_KINDS = ["associazione", "associato"] as const;
export type MarketSellerKind = (typeof MARKET_SELLER_KINDS)[number];

export const MARKET_HANDOVERS = ["sede", "diretto"] as const;
export type MarketHandover = (typeof MARKET_HANDOVERS)[number];

export type MarketPayMethod = (typeof MARKET_PAY_METHODS)[number];

export const MARKET_ORDER_STATUSES = [
  "richiesto",
  "in_attesa",
  "pagato",
  "ritirato",
  "annullato",
] as const;

export type MarketOrderStatus = (typeof MARKET_ORDER_STATUSES)[number];

export const MARKET_IBAN_KEY = "market_iban";
export const MARKET_IBAN_HOLDER_KEY = "market_iban_holder";

export type MarketListing = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  status: MarketListingStatus;
  photoPath: string | null;
  /** URL assoluto (es. annunci ufficio da piattaforma Eventi). */
  photoUrl?: string | null;
  createdAt: string;
  sellerKind: MarketSellerKind;
  sellerMemberId: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  sellerEmail: string | null;
  handover: MarketHandover | null;
  fixedAssetId: string | null;
  categoryLabel?: string | null;
  conditionLabel?: string | null;
  source?: "school" | "eventi_desk";
};

export type MarketOrder = {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerName: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  method: MarketPayMethod;
  status: MarketOrderStatus;
  amountCents: number;
  createdAt: string;
};

export type MarketPaymentSettings = {
  iban: string;
  holder: string;
};

type ListingRow = Database["public"]["Tables"]["market_listings"]["Row"];

export function parseMarketPriceEuros(raw: string): number | null {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const euros = Number(normalized);
  if (!Number.isFinite(euros) || euros <= 0 || euros > 100_000) return null;
  return Math.round(euros * 100);
}

export function marketListingStatusLabel(status: MarketListingStatus): string {
  if (status === "bozza") return "Bozza";
  if (status === "in_revisione") return "In revisione";
  if (status === "rifiutato") return "Rifiutato";
  if (status === "in_vendita") return "In vendita";
  if (status === "riservato") return "Riservato";
  return "Venduto";
}

export function marketPayMethodLabel(method: MarketPayMethod): string {
  if (method === "bonifico") return "Bonifico";
  if (method === "contanti") return "Contanti";
  if (method === "tra_privati") return "Tra privati";
  return "Nexi";
}

export function marketHandoverLabel(handover: MarketHandover | null): string {
  if (handover === "sede") return "Ritiro in sede";
  if (handover === "diretto") return "Consegna tra di voi";
  return "Ritiro in sede";
}

export function marketOrderStatusLabel(status: MarketOrderStatus): string {
  if (status === "richiesto") return "Richiesto";
  if (status === "in_attesa") return "In attesa";
  if (status === "pagato") return "Pagato";
  if (status === "ritirato") return "Ritirato";
  return "Annullato";
}

export function marketPhotoPublicUrl(
  photoPath: string | null,
  supabaseUrl: string,
): string | null {
  const path = photoPath?.trim();
  const base = supabaseUrl.trim().replace(/\/$/, "");
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/website/${path}`;
}

export function marketListingDisplayPhoto(
  item: Pick<MarketListing, "photoPath" | "photoUrl">,
  supabaseUrl: string,
): string | null {
  const direct = item.photoUrl?.trim();
  if (direct) return direct;
  return marketPhotoPublicUrl(item.photoPath, supabaseUrl);
}

function mapListing(row: ListingRow): MarketListing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    status: row.status,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    sellerKind: row.seller_kind,
    sellerMemberId: row.seller_member_id,
    sellerName: row.seller_name,
    sellerPhone: row.seller_phone,
    sellerEmail: row.seller_email,
    handover: row.handover,
    fixedAssetId: row.fixed_asset_id,
  };
}

export async function listMarketListings(
  client: MarketClient,
): Promise<MarketListing[]> {
  const { data, error } = await client
    .from("market_listings")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Impossibile caricare gli oggetti.");
  }

  return (data ?? []).map(mapListing);
}

export async function listMarketOrders(
  client: MarketClient,
): Promise<MarketOrder[]> {
  const { data, error } = await client
    .from("market_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(error.message || "Impossibile caricare le richieste.");
  }

  const rows = data ?? [];
  const listingIds = [...new Set(rows.map((row) => row.listing_id))];
  const titles = new Map<string, string>();
  if (listingIds.length > 0) {
    const listed = await client
      .from("market_listings")
      .select("id, title")
      .in("id", listingIds);
    if (listed.error) {
      throw new Error(listed.error.message || "Impossibile caricare gli oggetti.");
    }
    for (const listing of listed.data ?? []) {
      titles.set(listing.id, listing.title);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    listingId: row.listing_id,
    listingTitle: titles.get(row.listing_id) || "Oggetto",
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    method: row.method,
    status: row.status,
    amountCents: row.amount_cents,
    createdAt: row.created_at,
  }));
}

export async function getMarketPaymentSettings(
  client: MarketClient,
): Promise<MarketPaymentSettings> {
  const { data, error } = await client
    .from("app_settings")
    .select("key, value")
    .in("key", [MARKET_IBAN_KEY, MARKET_IBAN_HOLDER_KEY]);

  if (error) {
    throw new Error(error.message || "Impossibile leggere il bonifico.");
  }

  const values = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    iban: values.get(MARKET_IBAN_KEY) ?? "",
    holder: values.get(MARKET_IBAN_HOLDER_KEY) ?? "",
  };
}

export async function saveMarketPaymentSettings(
  client: MarketClient,
  input: MarketPaymentSettings,
): Promise<void> {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const holder = input.holder.trim().slice(0, 160);
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    throw new Error("IBAN non valido.");
  }

  const rows = [
    { key: MARKET_IBAN_KEY, value: iban, description: "IBAN Market" },
    {
      key: MARKET_IBAN_HOLDER_KEY,
      value: holder,
      description: "Intestatario bonifico Market",
    },
  ];

  const { error } = await client.from("app_settings").upsert(rows);
  if (error) {
    throw new Error(error.message || "Impossibile salvare il bonifico.");
  }
}

export function normalizeMarketTitle(raw: string): string | null {
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 120) return null;
  return title;
}

export function normalizeMarketDescription(raw: string): string {
  return raw.trim().slice(0, 2000);
}

export async function createMarketListing(
  client: MarketClient,
  input: {
    title: string;
    priceCents: number;
    description?: string;
    status?: "bozza" | "in_vendita";
  },
): Promise<MarketListing> {
  const title = normalizeMarketTitle(input.title);
  if (!title) throw new Error("Titolo mancante.");
  if (input.priceCents < 100) throw new Error("Prezzo minimo 1 euro.");

  const { data, error } = await client
    .from("market_listings")
    .insert({
      title,
      price_cents: input.priceCents,
      status: input.status === "in_vendita" ? "in_vendita" : "bozza",
      description: normalizeMarketDescription(input.description ?? ""),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Impossibile creare l'oggetto.");
  }
  return mapListing(data);
}

export async function updateMarketListing(
  client: MarketClient,
  id: string,
  patch: {
    title?: string;
    description?: string;
    priceCents?: number;
    status?: "bozza" | "in_revisione" | "rifiutato" | "in_vendita" | "venduto";
    photoPath?: string | null;
  },
): Promise<void> {
  const current = await client
    .from("market_listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!current.data) throw new Error("Oggetto non trovato.");
  const row = current.data;
  const locked = row.status === "riservato" || row.status === "venduto";
  if (locked && (patch.status || patch.priceCents != null || patch.title || patch.description != null)) {
    throw new Error("Oggetto riservato o venduto: chiudi prima la richiesta.");
  }

  const update: Database["public"]["Tables"]["market_listings"]["Update"] = {};
  if (patch.title != null) {
    const title = normalizeMarketTitle(patch.title);
    if (!title) throw new Error("Titolo non valido.");
    update.title = title;
  }
  if (patch.description != null) {
    update.description = normalizeMarketDescription(patch.description);
  }
  if (patch.priceCents != null) {
    if (patch.priceCents < 100) throw new Error("Prezzo minimo 1 euro.");
    update.price_cents = patch.priceCents;
  }
  if (patch.status) update.status = patch.status;
  if (patch.photoPath !== undefined) update.photo_path = patch.photoPath;
  if (Object.keys(update).length === 0) return;

  const { error } = await client.from("market_listings").update(update).eq("id", id);
  if (error) throw new Error(error.message || "Impossibile aggiornare l'oggetto.");
}

export async function deleteMarketListing(
  client: MarketClient,
  id: string,
): Promise<string | null> {
  const current = await client
    .from("market_listings")
    .select("status, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (!current.data) throw new Error("Oggetto non trovato.");
  if (
    current.data.status !== "bozza" &&
    current.data.status !== "in_revisione" &&
    current.data.status !== "rifiutato" &&
    current.data.status !== "in_vendita"
  ) {
    throw new Error("Questo annuncio non si può eliminare.");
  }
  const { error } = await client.from("market_listings").delete().eq("id", id);
  if (error) throw new Error(error.message || "Impossibile eliminare l'oggetto.");
  return current.data.photo_path;
}

export async function createAssociateListing(
  client: MarketClient,
  input: {
    memberId: string;
    sellerName: string;
    title: string;
    description: string;
    priceCents: number;
    phone: string;
    email: string;
    handover: MarketHandover;
  },
): Promise<MarketListing> {
  const title = normalizeMarketTitle(input.title);
  if (!title) throw new Error("Titolo mancante.");
  if (input.priceCents < 100) throw new Error("Prezzo minimo 1 euro.");
  const phone = input.phone.trim();
  const email = input.email.trim().toLowerCase();
  if (phone.replace(/\D/g, "").length < 6 && !email.includes("@")) {
    throw new Error("Lascia telefono o email.");
  }
  if (input.handover !== "sede" && input.handover !== "diretto") {
    throw new Error("Scegli come consegnare l'oggetto.");
  }

  const { data, error } = await client
    .from("market_listings")
    .insert({
      title,
      description: normalizeMarketDescription(input.description),
      price_cents: input.priceCents,
      status: "in_revisione",
      seller_kind: "associato",
      seller_member_id: input.memberId,
      seller_name: input.sellerName.trim().slice(0, 120) || null,
      seller_phone: phone || null,
      seller_email: email || null,
      handover: input.handover,
      fixed_asset_id: null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Impossibile inviare l'annuncio.");
  }
  return mapListing(data);
}

export async function updateAssociateListing(
  client: MarketClient,
  id: string,
  memberId: string,
  patch: {
    title?: string;
    description?: string;
    priceCents?: number;
    phone?: string;
    email?: string;
    handover?: MarketHandover;
    sold?: boolean;
  },
): Promise<void> {
  const current = await client
    .from("market_listings")
    .select("*")
    .eq("id", id)
    .eq("seller_member_id", memberId)
    .maybeSingle();
  if (!current.data) throw new Error("Annuncio non trovato.");
  if (current.data.status === "riservato" || current.data.status === "venduto") {
    throw new Error("Questo annuncio non si può modificare.");
  }

  const update: Database["public"]["Tables"]["market_listings"]["Update"] = {
    status: patch.sold ? "venduto" : "in_revisione",
  };
  if (patch.title != null) {
    const title = normalizeMarketTitle(patch.title);
    if (!title) throw new Error("Titolo non valido.");
    update.title = title;
  }
  if (patch.description != null) {
    update.description = normalizeMarketDescription(patch.description);
  }
  if (patch.priceCents != null) {
    if (patch.priceCents < 100) throw new Error("Prezzo minimo 1 euro.");
    update.price_cents = patch.priceCents;
  }
  if (patch.phone != null) update.seller_phone = patch.phone.trim() || null;
  if (patch.email != null) update.seller_email = patch.email.trim().toLowerCase() || null;
  if (patch.handover) update.handover = patch.handover;

  const { error } = await client
    .from("market_listings")
    .update(update)
    .eq("id", id)
    .eq("seller_member_id", memberId);
  if (error) throw new Error(error.message || "Impossibile aggiornare l'annuncio.");
}

export async function setMarketOrderStatus(
  client: MarketClient,
  orderId: string,
  next: "pagato" | "ritirato" | "annullato",
  actorMemberId?: string | null,
): Promise<void> {
  const found = await client
    .from("market_orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!found.data) throw new Error("Richiesta non trovata.");
  const order = found.data;
  if (order.status === "ritirato" || order.status === "annullato") {
    throw new Error("Richiesta già chiusa.");
  }

  if (next === "annullato") {
    if (order.status === "pagato") {
      throw new Error("Ordine già pagato. Segna il ritiro.");
    }
    const cancelled = await client
      .from("market_orders")
      .update({ status: "annullato" })
      .eq("id", orderId);
    if (cancelled.error) throw new Error(cancelled.error.message);
    await client
      .from("market_listings")
      .update({ status: "in_vendita" })
      .eq("id", order.listing_id)
      .eq("status", "riservato");
    return;
  }

  if (next === "pagato") {
    if (order.status !== "pagato") {
      const paid = await client
        .from("market_orders")
        .update({ status: "pagato" })
        .eq("id", orderId);
      if (paid.error) throw new Error(paid.error.message);
    }
    return;
  }

  if (order.status !== "pagato" && order.method !== "contanti") {
    throw new Error("Segna prima il pagamento.");
  }
  await recordMarketSale(client, order, actorMemberId);
  const picked = await client
    .from("market_orders")
    .update({ status: "ritirato" })
    .eq("id", orderId);
  if (picked.error) throw new Error(picked.error.message);
  const sold = await client
    .from("market_listings")
    .update({ status: "venduto" })
    .eq("id", order.listing_id);
  if (sold.error) throw new Error(sold.error.message);
}
