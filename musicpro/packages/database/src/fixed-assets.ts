import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types/database";

type FixedAssetsClient = SupabaseClient<Database>;

export const LOCATION_PRESETS = [
  "sala_arancio",
  "sala_blu",
  "sala_verde",
  "sala_rossa",
  "ingresso",
  "magazzino",
  "box",
  "altro",
] as const;

export type LocationPreset = (typeof LOCATION_PRESETS)[number];

export const LOCATION_PRESET_LABELS: Record<LocationPreset, string> = {
  sala_arancio: "Sala Arancio",
  sala_blu: "Sala Blu",
  sala_verde: "Sala Verde",
  sala_rossa: "Sala Rossa",
  ingresso: "Ingresso",
  magazzino: "Magazzino",
  box: "Box",
  altro: "Altro",
};

export const ACCESSORY_TAGS = [
  { key: "alimentatore", label: "Alimentatore" },
  { key: "batteria", label: "Batteria" },
  { key: "cavo", label: "Cavo" },
  { key: "cavo_segnale", label: "Cavo segnale" },
  { key: "cavo_alimentazione", label: "Cavo alimentazione" },
  { key: "cavo_potenza", label: "Cavo potenza" },
  { key: "caricabatterie", label: "Caricabatterie" },
  { key: "custodia", label: "Custodia" },
  { key: "chiave", label: "Chiave" },
  { key: "footswitch", label: "Footswitch" },
  { key: "leggio", label: "Leggio" },
  { key: "manuale", label: "Manuale" },
  { key: "microfono", label: "Microfono" },
  { key: "pedale", label: "Pedale" },
  { key: "supporto", label: "Supporto" },
  { key: "telecomando", label: "Telecomando" },
  { key: "tracolla", label: "Tracolla" },
] as const;

export type AccessoryTagKey = (typeof ACCESSORY_TAGS)[number]["key"];

export const ACCESSORY_TAG_LABELS: Record<AccessoryTagKey, string> =
  Object.fromEntries(ACCESSORY_TAGS.map((tag) => [tag.key, tag.label])) as Record<
    AccessoryTagKey,
    string
  >;

export type FixedAssetEventType =
  | "acquisto"
  | "donazione"
  | "perdita"
  | "smarrimento"
  | "rottura"
  | "trasferimento";

export interface FixedAsset {
  id: string;
  quantity: number;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  accessories: string[];
  purchasedAt: string | null;
  locationPreset: LocationPreset | null;
  locationCustom: string | null;
  notes: string | null;
  disposedAt: string | null;
  deletedAt: string | null;
  photoStoragePath: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface FixedAssetInput {
  quantity?: number;
  name: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  accessories?: string[];
  purchasedAt?: string | null;
  locationPreset?: LocationPreset | null;
  locationCustom?: string | null;
  notes?: string | null;
  photoStoragePath?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface FixedAssetEvent {
  id: string;
  assetId: string;
  eventType: FixedAssetEventType;
  eventDate: string | null;
  notes: string | null;
  verbaleRef: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface FixedAssetEventInput {
  eventType: FixedAssetEventType;
  eventDate?: string | null;
  notes?: string | null;
  verbaleRef?: string | null;
  createdBy?: string | null;
}

export interface DuplicateMatch {
  asset: FixedAsset;
  matchKind: "exact" | "same_location_no_serial";
  message: string;
}

export interface ListFixedAssetsOptions {
  search?: string;
  location?: LocationPreset;
  locations?: LocationPreset[];
  includeDisposed?: boolean;
  includeDeleted?: boolean;
  withoutPhoto?: boolean;
  withoutSerial?: boolean;
}

export interface FixedAssetMutationResult {
  success: boolean;
  id?: string;
  errorMessage?: string;
}

type FixedAssetRow = Database["public"]["Tables"]["fixed_assets"]["Row"];
type FixedAssetEventRow =
  Database["public"]["Tables"]["fixed_asset_events"]["Row"];

const FIXED_ASSET_COLUMNS =
  "id, quantity, name, brand, model, serial, accessories, purchased_at, location_preset, location_custom, notes, disposed_at, deleted_at, photo_storage_path, created_at, updated_at, created_by, updated_by";

const FIXED_ASSET_EVENT_COLUMNS =
  "id, asset_id, event_type, event_date, notes, verbale_ref, created_at, created_by";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeBrand(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim();
}

function normalizeSerial(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (normalized == null || normalized === "-") return null;
  return normalized;
}

function hasSerial(value: string | null | undefined): boolean {
  return normalizeSerial(value) != null;
}

function normalizeAccessories(accessories: string[] | null | undefined): string[] {
  const unique = [...new Set((accessories ?? []).map((item) => item.trim()).filter(Boolean))];
  return unique.sort((a, b) => a.localeCompare(b, "it"));
}

function locationPresetRank(preset: LocationPreset | null): number {
  if (preset == null) return LOCATION_PRESETS.length;
  const index = LOCATION_PRESETS.indexOf(preset);
  return index >= 0 ? index : LOCATION_PRESETS.length;
}

function sortFixedAssets(assets: FixedAsset[]): FixedAsset[] {
  return [...assets].sort((a, b) => {
    const presetDiff =
      locationPresetRank(a.locationPreset) - locationPresetRank(b.locationPreset);
    if (presetDiff !== 0) return presetDiff;
    return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
  });
}

function mapFixedAsset(row: FixedAssetRow): FixedAsset {
  return {
    id: row.id,
    quantity: row.quantity,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial: row.serial,
    accessories: row.accessories ?? [],
    purchasedAt: row.purchased_at,
    locationPreset: row.location_preset as LocationPreset | null,
    locationCustom: row.location_custom,
    notes: row.notes,
    disposedAt: row.disposed_at,
    deletedAt: row.deleted_at,
    photoStoragePath: row.photo_storage_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function mapFixedAssetEvent(row: FixedAssetEventRow): FixedAssetEvent {
  return {
    id: row.id,
    assetId: row.asset_id,
    eventType: row.event_type as FixedAssetEventType,
    eventDate: row.event_date,
    notes: row.notes,
    verbaleRef: row.verbale_ref,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

function mapFixedAssetInput(
  input: FixedAssetInput,
): Database["public"]["Tables"]["fixed_assets"]["Insert"] {
  return {
    quantity: input.quantity ?? 1,
    name: input.name.trim(),
    brand: normalizeBrand(input.brand),
    model: normalizeOptionalText(input.model),
    serial: normalizeSerial(input.serial),
    accessories: normalizeAccessories(input.accessories),
    purchased_at: normalizeOptionalText(input.purchasedAt),
    location_preset: input.locationPreset ?? null,
    location_custom: normalizeOptionalText(input.locationCustom),
    notes: normalizeOptionalText(input.notes),
    photo_storage_path: normalizeOptionalText(input.photoStoragePath),
    created_by: input.createdBy ?? null,
    updated_by: input.updatedBy ?? null,
  };
}

function validateFixedAssetInput(input: FixedAssetInput): string | null {
  if (!input.name.trim()) {
    return "Il nome del bene è obbligatorio.";
  }

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    return "La quantità deve essere un intero maggiore o uguale a 1.";
  }

  if (
    input.locationPreset != null &&
    !LOCATION_PRESETS.includes(input.locationPreset)
  ) {
    return "Ubicazione non valida.";
  }

  return null;
}

export interface DuplicateComparableFields {
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
  accessories: string[];
  locationPreset: LocationPreset | null;
  locationCustom: string | null;
  purchasedAt: string | null;
}

function toDuplicateComparableFields(
  input: FixedAssetInput | FixedAsset,
): DuplicateComparableFields {
  return {
    name: input.name.trim(),
    brand: normalizeBrand(input.brand),
    model: normalizeOptionalText(input.model),
    serial: normalizeSerial(input.serial),
    accessories: normalizeAccessories(input.accessories),
    locationPreset: input.locationPreset ?? null,
    locationCustom: normalizeOptionalText(input.locationCustom),
    purchasedAt: normalizeOptionalText(input.purchasedAt),
  };
}

function duplicateFieldsEqual(
  a: DuplicateComparableFields,
  b: DuplicateComparableFields,
): boolean {
  return (
    a.name.localeCompare(b.name, "it", { sensitivity: "base" }) === 0 &&
    (a.brand ?? "") === (b.brand ?? "") &&
    (a.model ?? "") === (b.model ?? "") &&
    (a.serial ?? "") === (b.serial ?? "") &&
    a.accessories.join("\0") === b.accessories.join("\0") &&
    a.locationPreset === b.locationPreset &&
    (a.locationCustom ?? "") === (b.locationCustom ?? "") &&
    (a.purchasedAt ?? "") === (b.purchasedAt ?? "")
  );
}

function buildDuplicateMessage(
  asset: FixedAsset,
  matchKind: DuplicateMatch["matchKind"],
): string {
  if (matchKind === "same_location_no_serial") {
    const locationLabel = asset.locationPreset
      ? LOCATION_PRESET_LABELS[asset.locationPreset]
      : "ubicazione non specificata";
    const custom =
      asset.locationCustom && asset.locationCustom.trim() !== ""
        ? ` (${asset.locationCustom.trim()})`
        : "";
    return `Esistono già ${asset.quantity} pezzi in ${locationLabel}${custom} senza numero di serie.`;
  }

  if (asset.serial) {
    return "Esiste già un bene con gli stessi dati e lo stesso numero di serie.";
  }

  return "Esiste già un bene con gli stessi dati.";
}

export async function listFixedAssets(
  client: FixedAssetsClient,
  options: ListFixedAssetsOptions = {},
): Promise<FixedAsset[]> {
  let query = client.from("fixed_assets").select(FIXED_ASSET_COLUMNS);

  if (!options.includeDeleted) {
    query = query.is("deleted_at", null);
  }

  if (!options.includeDisposed) {
    query = query.is("disposed_at", null);
  }

  if (options.locations && options.locations.length > 0) {
    query = query.in("location_preset", options.locations);
  } else if (options.location) {
    query = query.eq("location_preset", options.location);
  }

  if (options.withoutPhoto) {
    query = query.is("photo_storage_path", null);
  }

  if (options.withoutSerial) {
    query = query.or("serial.is.null,serial.eq.,serial.eq.-");
  }

  const term = options.search?.trim();
  if (term) {
    query = query.or(
      [
        `name.ilike.%${term}%`,
        `brand.ilike.%${term}%`,
        `model.ilike.%${term}%`,
        `serial.ilike.%${term}%`,
        `location_custom.ilike.%${term}%`,
        `notes.ilike.%${term}%`,
      ].join(","),
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Impossibile caricare i cespiti: ${error.message}`);
  }

  return sortFixedAssets((data ?? []).map((row) => mapFixedAsset(row as FixedAssetRow)));
}

export async function getFixedAssetById(
  client: FixedAssetsClient,
  id: string,
): Promise<FixedAsset | null> {
  const { data, error } = await client
    .from("fixed_assets")
    .select(FIXED_ASSET_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossibile caricare il cespite: ${error.message}`);
  }

  return data ? mapFixedAsset(data as FixedAssetRow) : null;
}

export async function createFixedAsset(
  client: FixedAssetsClient,
  input: FixedAssetInput,
): Promise<FixedAssetMutationResult> {
  const validationError = validateFixedAssetInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const { data, error } = await client
    .from("fixed_assets")
    .insert(mapFixedAssetInput(input))
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile creare il cespite.",
    };
  }

  return { success: true, id: data.id };
}

export async function updateFixedAsset(
  client: FixedAssetsClient,
  id: string,
  input: FixedAssetInput,
): Promise<FixedAssetMutationResult> {
  const validationError = validateFixedAssetInput(input);
  if (validationError) {
    return { success: false, errorMessage: validationError };
  }

  const row = mapFixedAssetInput(input);
  const { error } = await client
    .from("fixed_assets")
    .update({
      ...row,
      updated_by: input.updatedBy ?? row.updated_by ?? null,
    })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile aggiornare il cespite.",
    };
  }

  return { success: true, id };
}

export async function softDeleteFixedAsset(
  client: FixedAssetsClient,
  id: string,
  updatedBy?: string | null,
): Promise<FixedAssetMutationResult> {
  const { error } = await client
    .from("fixed_assets")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare il cespite.",
    };
  }

  return { success: true, id };
}

export async function hardDeleteFixedAsset(
  client: FixedAssetsClient,
  id: string,
): Promise<FixedAssetMutationResult> {
  const { error } = await client.from("fixed_assets").delete().eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile eliminare definitivamente il cespite.",
    };
  }

  return { success: true, id };
}

export async function markDisposedFixedAsset(
  client: FixedAssetsClient,
  id: string,
  disposedAt?: string,
  updatedBy?: string | null,
): Promise<FixedAssetMutationResult> {
  const { error } = await client
    .from("fixed_assets")
    .update({
      disposed_at: disposedAt ?? new Date().toISOString(),
      updated_by: updatedBy ?? null,
    })
    .eq("id", id);

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile segnare il cespite come dismesso.",
    };
  }

  return { success: true, id };
}

export async function duplicateFixedAsset(
  client: FixedAssetsClient,
  id: string,
  actorMemberId?: string | null,
): Promise<FixedAssetMutationResult> {
  const source = await getFixedAssetById(client, id);
  if (!source) {
    return { success: false, errorMessage: "Cespite non trovato." };
  }

  return createFixedAsset(client, {
    quantity: 1,
    name: source.name,
    brand: source.brand,
    model: source.model,
    serial: source.serial,
    accessories: source.accessories,
    purchasedAt: source.purchasedAt,
    locationPreset: source.locationPreset,
    locationCustom: source.locationCustom,
    notes: source.notes,
    photoStoragePath: source.photoStoragePath,
    createdBy: actorMemberId ?? null,
    updatedBy: actorMemberId ?? null,
  });
}

export async function findDuplicateMatches(
  client: FixedAssetsClient,
  input: FixedAssetInput,
  excludeId?: string,
): Promise<DuplicateMatch[]> {
  const comparable = toDuplicateComparableFields(input);
  const candidates = await listFixedAssets(client, {
    includeDeleted: false,
    includeDisposed: false,
  });

  const matches: DuplicateMatch[] = [];

  for (const asset of candidates) {
    if (excludeId && asset.id === excludeId) continue;

    const assetComparable = toDuplicateComparableFields(asset);
    if (!duplicateFieldsEqual(comparable, assetComparable)) continue;

    const bothWithoutSerial =
      !hasSerial(comparable.serial) && !hasSerial(assetComparable.serial);

    matches.push({
      asset,
      matchKind: bothWithoutSerial ? "same_location_no_serial" : "exact",
      message: buildDuplicateMessage(
        asset,
        bothWithoutSerial ? "same_location_no_serial" : "exact",
      ),
    });
  }

  return matches;
}

export async function mergeQuantities(
  client: FixedAssetsClient,
  targetId: string,
  sourceId: string,
  updatedBy?: string | null,
): Promise<FixedAssetMutationResult> {
  if (targetId === sourceId) {
    return {
      success: false,
      errorMessage: "Non è possibile unire un cespite con se stesso.",
    };
  }

  const [target, source] = await Promise.all([
    getFixedAssetById(client, targetId),
    getFixedAssetById(client, sourceId),
  ]);

  if (!target || !source) {
    return { success: false, errorMessage: "Cespite non trovato." };
  }

  if (source.deletedAt) {
    return { success: false, errorMessage: "Il cespite sorgente è già eliminato." };
  }

  const { error: updateError } = await client
    .from("fixed_assets")
    .update({
      quantity: target.quantity + source.quantity,
      updated_by: updatedBy ?? null,
    })
    .eq("id", targetId);

  if (updateError) {
    return {
      success: false,
      errorMessage: updateError.message || "Impossibile unire le quantità.",
    };
  }

  return softDeleteFixedAsset(client, sourceId, updatedBy);
}

export async function listFixedAssetEvents(
  client: FixedAssetsClient,
  assetId: string,
): Promise<FixedAssetEvent[]> {
  const { data, error } = await client
    .from("fixed_asset_events")
    .select(FIXED_ASSET_EVENT_COLUMNS)
    .eq("asset_id", assetId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Impossibile caricare gli eventi del cespite: ${error.message}`);
  }

  return (data ?? []).map((row) => mapFixedAssetEvent(row as FixedAssetEventRow));
}

export async function addFixedAssetEvent(
  client: FixedAssetsClient,
  assetId: string,
  input: FixedAssetEventInput,
): Promise<FixedAssetMutationResult> {
  const asset = await getFixedAssetById(client, assetId);
  if (!asset) {
    return { success: false, errorMessage: "Cespite non trovato." };
  }

  const { data, error } = await client
    .from("fixed_asset_events")
    .insert({
      asset_id: assetId,
      event_type: input.eventType,
      event_date: normalizeOptionalText(input.eventDate),
      notes: normalizeOptionalText(input.notes),
      verbale_ref: normalizeOptionalText(input.verbaleRef),
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return {
      success: false,
      errorMessage: error.message || "Impossibile registrare l'evento.",
    };
  }

  return { success: true, id: data.id };
}
