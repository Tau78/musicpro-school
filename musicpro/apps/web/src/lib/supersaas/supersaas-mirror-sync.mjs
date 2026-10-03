import {
  SCHEMA_APPLY_BLOCK,
  SUPERSAAS_SOURCE,
  indexRoomsByCanonical,
  isMissingMirrorSchema,
  loadSuperSaasCatalog,
  planSuperSaasImport,
  safeNormalizeBooking,
} from "./supersaas-bookings.mjs";

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function probeSuperSaasSchema(supabase) {
  const mirror = await supabase
    .from("supersaas_slot_mirrors")
    .select("external_id")
    .limit(1);
  const column = await supabase
    .from("bookings")
    .select("external_source, external_id")
    .limit(1);
  const error = mirror.error || column.error;
  return {
    ready: !error,
    missing: Boolean(error && isMissingMirrorSchema(error)),
    error,
  };
}

async function setSetting(supabase, key, value) {
  const { data, error } = await supabase
    .from("app_settings")
    .update({ value })
    .eq("key", key)
    .select("key");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error(SCHEMA_APPLY_BLOCK);
  }
}

async function listMirrorIds(supabase) {
  const ids = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("supersaas_slot_mirrors")
      .select("external_id")
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    ids.push(...data.map((row) => row.external_id));
    if (data.length < page) break;
  }
  return ids;
}

export async function replaceSuperSaasMirror(supabase, rows) {
  const stamped = rows.map((row) => ({
    ...row,
    synced_at: new Date().toISOString(),
  }));
  for (const chunk of chunks(stamped, 200)) {
    const { error } = await supabase
      .from("supersaas_slot_mirrors")
      .upsert(chunk, { onConflict: "external_id" });
    if (error) throw new Error(error.message);
  }
  const desired = new Set(stamped.map((row) => row.external_id));
  const existing = await listMirrorIds(supabase);
  const drop = existing.filter((id) => !desired.has(id));
  for (const chunk of chunks(drop, 100)) {
    const { error } = await supabase
      .from("supersaas_slot_mirrors")
      .delete()
      .in("external_id", chunk);
    if (error) throw new Error(error.message);
  }
}

export async function loadImportedExternalIds(supabase) {
  const ids = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("bookings")
      .select("external_id")
      .eq("external_source", SUPERSAAS_SOURCE)
      .not("external_id", "is", null)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    ids.push(...data.map((row) => row.external_id));
    if (data.length < page) break;
  }
  return new Set(ids);
}

export async function markSuperSaasMirrorFresh(supabase) {
  const syncedAt = new Date().toISOString();
  await setSetting(supabase, "supersaas_mirror_synced_at", syncedAt);
  await setSetting(supabase, "supersaas_mirror_enforce", "1");
  return syncedAt;
}

export function roomsForMirror(rooms) {
  const active = (rooms ?? []).filter((room) => room.is_active !== false);
  const indexed = indexRoomsByCanonical(active);
  if (indexed.ambiguous.length) {
    throw new Error(
      `Più sale MusicPro corrispondono a ${indexed.ambiguous.join(", ")}. Import interrotto.`,
    );
  }
  return indexed.byKey;
}

export async function syncSuperSaasMirror(supabase, { apiKey, account, now = new Date() }) {
  const schema = await probeSuperSaasSchema(supabase);
  if (!schema.ready) {
    throw new Error(schema.missing ? SCHEMA_APPLY_BLOCK : schema.error?.message || SCHEMA_APPLY_BLOCK);
  }

  const catalog = await loadSuperSaasCatalog({ apiKey, account, now });
  const { data: roomRows, error: roomError } = await supabase
    .from("rooms")
    .select("id, name, is_active");
  if (roomError) throw new Error(roomError.message);

  const roomsByKey = roomsForMirror(roomRows);
  const importedIds = await loadImportedExternalIds(supabase);
  const normalized = [];
  const parseErrors = [];
  for (const raw of catalog.rawBookings) {
    const result = safeNormalizeBooking(raw, catalog.resourcesById);
    if (!result.ok) {
      parseErrors.push(`#${result.externalId}`);
      continue;
    }
    normalized.push(result.booking);
  }

  const plan = planSuperSaasImport({
    memberBookings: [],
    mirrorSource: normalized,
    roomsByKey,
    importedExternalIds: importedIds,
    occupying: [],
    nowMs: now.getTime(),
  });
  if (plan.blocked || parseErrors.length) {
    throw new Error(
      `Specchio non aggiornato: ${[...plan.unknownResources, ...parseErrors].join(", ")}`,
    );
  }

  await replaceSuperSaasMirror(supabase, plan.mirror);
  const syncedAt = await markSuperSaasMirrorFresh(supabase);
  return {
    mirrored: plan.mirror.length,
    syncedAt,
    scheduleId: catalog.schedule.id,
  };
}

export { SCHEMA_APPLY_BLOCK };
