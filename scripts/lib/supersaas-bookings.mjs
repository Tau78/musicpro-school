/**
 * Import e specchio read-only SuperSaaS → MusicPro School.
 * Solo GET verso SuperSaaS. Nessuna email, nessun pagamento, nessun
 * attributo di prenotazione a un associato diverso da quello richiesto.
 */

export const ROME = "Europe/Rome";
export const SUPERSAAS_SOURCE = "supersaas";
export const MIRROR_MAX_AGE_MS = 30 * 60 * 1000;
export const MAX_DURATION_MINUTES = 24 * 60;

export const SCHEMA_APPLY_BLOCK = [
  "--apply bloccato: il database non ha ancora lo specchio anonimo SuperSaaS.",
  "Modifica necessaria, file supabase/migrations/082_supersaas_booking_import.sql:",
  "- bookings.external_source e bookings.external_id, univoci se valorizzati;",
  "- tabella supersaas_slot_mirrors (sala, inizio, fine, id SuperSaaS) senza member_id;",
  "- trigger che rifiuta le occupazioni sovrapposte a quello specchio;",
  "- la disponibilità sale legge lo specchio;",
  "- refresh almeno ogni 30 minuti (cron /api/cron/supersaas-mirror) finché SuperSaaS resta attivo.",
  "Senza questo, importare un solo associato lascerebbe liberi gli slot degli altri e il doppio booking resterebbe possibile.",
].join(" ");

const ROOM_ALIASES = {
  rossa: "rossa",
  "sala rossa": "rossa",
  verde: "verde",
  "sala verde": "verde",
  arancio: "arancio",
  arancione: "arancio",
  "sala arancio": "arancio",
  "sala arancione": "arancio",
  orange: "arancio",
};

const NOTE_KEYS = ["field_1_r", "field_2_r", "description", "note", "notes", "comment", "comments"];

export function normalizeEmail(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || !text.includes("@")) return "";
  return text;
}

export function normalizeRoomLabel(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUPERSAAS_ROOM_REDIRECTS = {
  blu: "verde",
};

function roomHead(label) {
  const parts = label.split(" ").filter(Boolean);
  return parts[0] === "sala" ? parts[1] : parts[0];
}

export function canonicalRoomKey(value) {
  const label = normalizeRoomLabel(value);
  if (!label) return null;
  if (ROOM_ALIASES[label]) return ROOM_ALIASES[label];
  const head = roomHead(label);
  if (!head) return null;
  return ROOM_ALIASES[head] ?? ROOM_ALIASES[`sala ${head}`] ?? null;
}

/** Sala Blu di SuperSaaS occupa la sala Verde in MusicPro. */
export function supersaasRoomKey(value) {
  const direct = canonicalRoomKey(value);
  if (direct) return direct;
  const head = roomHead(normalizeRoomLabel(value));
  return SUPERSAAS_ROOM_REDIRECTS[head] ?? null;
}

export function redactSecrets(text, secrets) {
  let out = String(text ?? "");
  const unique = [...new Set(secrets.filter((item) => item && String(item).length >= 4))];
  unique.sort((a, b) => String(b).length - String(a).length);
  for (const secret of unique) {
    out = out.split(String(secret)).join("[redacted]");
  }
  return out.replace(/api_key=[^&\s]+/gi, "api_key=[redacted]");
}

export function timeZoneOffsetMinutes(date, timeZone = ROME) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function formatRomeApi(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ROME,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatRomeLabel(ms) {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

/**
 * Interpreta l'orario SuperSaaS. I campi start/finish sono locali al calendario
 * (YYYY-MM-DD HH:MM:SS) senza offset: li trattiamo come Europe/Rome, ora legale inclusa.
 * Se la stringa ha già un offset o Z, vale quell'istante.
 */
export function parseSuperSaasDateTime(value, timeZone = ROME) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("data SuperSaaS vuota");
  }
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`data SuperSaaS non valida: ${trimmed}`);
    }
    return parsed;
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    throw new Error(`data SuperSaaS non valida: ${trimmed}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = wall;
  let stable = false;
  for (let i = 0; i < 4; i += 1) {
    const offset = timeZoneOffsetMinutes(new Date(utc), timeZone);
    const next = wall - offset * 60000;
    if (next === utc) {
      stable = true;
      break;
    }
    utc = next;
  }
  const result = new Date(utc);
  const back = formatRomeApi(result);
  const expected = `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${String(second).padStart(2, "0")}`;
  if (!stable || back !== expected) {
    throw new Error(
      `orario inesistente in ${timeZone} (ora legale): ${trimmed}`,
    );
  }
  return result;
}

export function parsePriceEur(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    // Interi API SuperSaaS: centesimi (2000 = 20,00 €, 3750 = 37,50 €).
    const euros = Number.isInteger(value) ? value / 100 : value;
    return Math.round(euros * 100) / 100;
  }
  const cleaned = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(",", ".");
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) return Number(cleaned) / 100;
  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

export function stripSensitive(text) {
  return String(text ?? "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/(?:\+|00)?\d[\d\s()./-]{6,}\d/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildImportNote(externalId, rawText) {
  const id = String(externalId ?? "").replace(/[^\w.:-]/g, "");
  const origin = `Origine: SuperSaaS #${id}`;
  const body = stripSensitive(rawText);
  if (!body || body === origin) return origin;
  return `${origin}\n${body}`.slice(0, 2000);
}

export function musicProOccupiesSlot(row) {
  if (!row || row.status === "cancelled") return false;
  const payment = row.payment_status ?? "";
  const held = row.credits_held ?? 0;
  if (
    row.status === "pending" &&
    (payment === "unpaid" || payment === "link_sent") &&
    held === 0
  ) {
    return false;
  }
  return true;
}

export function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

export function isDeletedBooking(raw) {
  const flag = raw?.deleted;
  return flag === true || flag === 1 || flag === "true" || flag === "1";
}

export function isWaitlisted(raw) {
  const flag = raw?.waitlisted;
  return flag === true || flag === "W" || flag === "w" || flag === "true";
}

export function isCancelledStatus(raw) {
  const status = String(raw?.status ?? "").toLowerCase();
  return /cancel|delet|annull/.test(status);
}

export function userMatchesEmail(user, email) {
  const target = normalizeEmail(email);
  if (!target || !user) return false;
  return [user.email, user.name, user.login].some(
    (value) => normalizeEmail(value) === target,
  );
}

export function bookingBelongsToUser(raw, user, email) {
  if (user && raw?.user_id != null && String(raw.user_id) === String(user.id)) {
    return true;
  }
  const target = normalizeEmail(email);
  if (!target) return false;
  return [raw?.email, raw?.created_by, raw?.user].some(
    (value) => normalizeEmail(value) === target,
  );
}

export function parseIdNameList(payload) {
  const list = Array.isArray(payload)
    ? payload
    : payload?.schedules || payload?.resources || payload?.services || [];
  if (!Array.isArray(list)) return [];
  return list.map((item) => {
    if (Array.isArray(item)) {
      return { id: String(item[0]), name: String(item[1] ?? "") };
    }
    return {
      id: String(item.id ?? item.schedule_id ?? ""),
      name: String(item.name ?? item.title ?? ""),
    };
  });
}

export function extractBookings(payload) {
  if (Array.isArray(payload?.slots) && !Array.isArray(payload?.bookings)) {
    throw new Error(
      "Lo schedule SuperSaaS è a capacità (slot), non a risorse. Import interrotto.",
    );
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bookings)) return payload.bookings;
  return [];
}

export function extractUsers(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.users)) return payload.users;
  return [];
}

function noteFromRaw(raw) {
  const chunks = [];
  for (const key of NOTE_KEYS) {
    const value = raw?.[key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (/^\d+$/.test(value.trim())) continue;
    chunks.push(value.trim());
  }
  return chunks.join("\n");
}

function microphoneCountFromRaw(raw) {
  const text = String(raw?.field_1_r ?? "").trim();
  if (!/^\d+$/.test(text)) return 0;
  const count = Number(text);
  return count >= 0 && count <= 4 ? count : 0;
}

export function normalizeSuperSaasBooking(raw, resourcesById) {
  const externalId = String(raw?.id ?? "").trim();
  if (!externalId) {
    throw new Error("prenotazione SuperSaaS senza id");
  }
  const serviceId =
    raw?.service_id != null && raw.service_id !== "" ? String(raw.service_id) : "";
  const resourceId =
    raw?.resource_id != null && raw.resource_id !== ""
      ? String(raw.resource_id)
      : serviceId;
  const catalogName =
    resourcesById?.get?.(serviceId)?.name || resourcesById?.get?.(resourceId)?.name || "";
  const explicitName =
    raw?.res_name ?? raw?.resource_name ?? (typeof raw?.resource === "string" ? raw.resource : "");
  const resourceName = String(explicitName || catalogName).trim();
  const start = parseSuperSaasDateTime(raw.start);
  const finish = parseSuperSaasDateTime(raw.finish ?? raw.end);
  return {
    externalId,
    resourceId,
    resourceName,
    startMs: start.getTime(),
    endMs: finish.getTime(),
    priceEur: parsePriceEur(raw.price),
    microphoneCount: microphoneCountFromRaw(raw),
    note: buildImportNote(externalId, noteFromRaw(raw)),
    active: !isDeletedBooking(raw) && !isWaitlisted(raw) && !isCancelledStatus(raw),
  };
}

export function indexRoomsByCanonical(rooms) {
  const byKey = new Map();
  const ambiguous = [];
  for (const room of rooms) {
    const key = canonicalRoomKey(room.name);
    if (!key) continue;
    if (byKey.has(key)) ambiguous.push(key);
    byKey.set(key, { id: room.id, name: room.name, key });
  }
  return { byKey, ambiguous: [...new Set(ambiguous)] };
}

export function planSuperSaasImport({
  memberBookings,
  mirrorSource,
  roomsByKey,
  importedExternalIds,
  occupying,
  nowMs,
}) {
  const unknown = new Set();
  const mapped = [];

  for (const booking of mirrorSource) {
    if (!booking.active) continue;
    if (!(booking.endMs > nowMs)) continue;
    const duration = Math.round((booking.endMs - booking.startMs) / 60000);
    if (duration <= 0 || duration > MAX_DURATION_MINUTES) {
      unknown.add(`durata non valida #${booking.externalId}`);
      continue;
    }
    const key = supersaasRoomKey(booking.resourceName);
    const room = key ? roomsByKey.get(key) : null;
    if (!room) {
      unknown.add(booking.resourceName || booking.resourceId || "(senza nome)");
      continue;
    }
    mapped.push({ ...booking, roomId: room.id, roomName: room.name, roomKey: key });
  }

  const unknownResources = [...unknown];
  const blocked = unknownResources.length > 0;
  const imported = importedExternalIds instanceof Set
    ? importedExternalIds
    : new Set(importedExternalIds ?? []);

  const rows = [];
  for (const booking of memberBookings) {
    if (!booking.active || !(booking.startMs > nowMs)) continue;
    const key = supersaasRoomKey(booking.resourceName);
    const room = key ? roomsByKey.get(key) : null;
    const duration = Math.round((booking.endMs - booking.startMs) / 60000);
    const base = {
      externalId: booking.externalId,
      roomId: room?.id ?? null,
      roomName: room?.name ?? booking.resourceName,
      startMs: booking.startMs,
      endMs: booking.endMs,
      durationMinutes: duration,
      priceEur: booking.priceEur,
      note: booking.note,
    };

    if (blocked) {
      rows.push({
        ...base,
        kind: "error",
        reason: "risorsa sconosciuta nel calendario: import bloccato",
      });
      continue;
    }
    if (!room) {
      rows.push({ ...base, kind: "error", reason: "sala sconosciuta" });
      continue;
    }
    if (!(booking.endMs > booking.startMs) || duration <= 0 || duration > MAX_DURATION_MINUTES) {
      rows.push({ ...base, kind: "error", reason: "data o durata non valida" });
      continue;
    }
    if (imported.has(booking.externalId)) {
      rows.push({ ...base, kind: "duplicate", reason: "già importata" });
      continue;
    }
    const conflict = (occupying ?? []).find(
      (slot) =>
        slot.roomId === room.id &&
        slot.externalId !== booking.externalId &&
        rangesOverlap(booking.startMs, booking.endMs, slot.startMs, slot.endMs),
    );
    if (conflict) {
      rows.push({
        ...base,
        kind: "conflict",
        reason: "sovrapposizione con una prenotazione MusicPro",
        conflictId: conflict.id ?? null,
      });
      continue;
    }
    const mirrorConflict = mapped.find(
      (other) =>
        other.externalId !== booking.externalId &&
        other.roomId === room.id &&
        rangesOverlap(booking.startMs, booking.endMs, other.startMs, other.endMs),
    );
    if (mirrorConflict) {
      rows.push({
        ...base,
        kind: "conflict",
        reason: "sovrapposizione con un'altra prenotazione SuperSaaS",
        conflictId: mirrorConflict.externalId,
      });
      continue;
    }
    rows.push({ ...base, kind: "importable", reason: "importabile" });
  }

  const mirror = blocked
    ? []
    : mapped
        .filter((booking) => !imported.has(booking.externalId))
        .map((booking) => ({
          external_id: booking.externalId,
          room_id: booking.roomId,
          start_at: new Date(booking.startMs).toISOString(),
          end_at: new Date(booking.endMs).toISOString(),
        }));

  return {
    blocked,
    unknownResources,
    rows,
    mirror,
    summary: summarize(rows, 0),
  };
}

export function summarize(rows, importedCount) {
  const count = (kind) => rows.filter((row) => row.kind === kind).length;
  return {
    trovate: rows.length,
    importabili: count("importable"),
    duplicate: count("duplicate"),
    inConflitto: count("conflict"),
    importate: importedCount,
    errori: count("error"),
  };
}

export function buildImportedBookingRow({ memberId, row }) {
  return {
    room_id: row.roomId,
    member_id: memberId,
    start_at: new Date(row.startMs).toISOString(),
    end_at: new Date(row.endMs).toISOString(),
    status: "confirmed",
    payment_status: "not_required",
    payment_method: null,
    credits_held: 0,
    credits_used: null,
    total_price_eur: row.priceEur,
    duration_minutes: row.durationMinutes,
    microphone_count: row.microphoneCount ?? 0,
    notes: row.note,
    source: "booking",
    external_source: SUPERSAAS_SOURCE,
    external_id: row.externalId,
    payment_link_url: null,
    payment_link_id: null,
    stripe_payment_intent_id: null,
    paid_at: null,
  };
}

export function isMissingMirrorSchema(error) {
  const message = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /supersaas_slot_mirrors|external_source/i.test(message) &&
    /schema cache|does not exist|Could not find|column/i.test(message);
}

export async function ssGet({ apiKey, account, path, params }) {
  if (!apiKey) throw new Error("SUPERSAAS_API_KEY mancante");
  if (!account) throw new Error("Account SuperSaaS mancante");
  const url = new URL(`https://www.supersaas.com/api/${path.replace(/^\//, "")}`);
  url.searchParams.set("account", account);
  // SuperSaaS rifiuta HTTP Basic per questa chiave e accetta api_key in query.
  // L'URL non va mai scritto nei log: gli errori citano solo il path.
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "richiesta fallita";
    throw new Error(
      `SuperSaaS irraggiungibile su ${path}: ${redactSecrets(message, [apiKey]).slice(0, 180)}`,
    );
  }
  const text = await response.text();
  const safe = redactSecrets(text, [apiKey]);
  if (!response.ok) {
    throw new Error(`SuperSaaS HTTP ${response.status} su ${path}: ${safe.slice(0, 240)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`SuperSaaS risposta non JSON su ${path}: ${safe.slice(0, 120)}`);
  }
}

async function pageUntil({ load, extract, limit = 200, cap = 20000, stopWhen }) {
  const rows = [];
  const seen = new Set();
  let offset = 0;
  for (;;) {
    const payload = await load(offset, limit);
    const page = extract(payload);
    if (!page.length) break;
    let fresh = 0;
    for (const row of page) {
      const id = String(row?.id ?? `${offset}:${fresh}`);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
      fresh += 1;
      if (stopWhen?.(row, rows)) return rows;
    }
    if (fresh === 0 || page.length < limit || rows.length >= cap) break;
    offset += page.length;
  }
  if (rows.length >= cap) {
    throw new Error("Risposta SuperSaaS troppo grande, import interrotto");
  }
  return rows;
}

export async function loadSuperSaasCatalog({ apiKey, account, now = new Date() }) {
  const schedules = parseIdNameList(
    await ssGet({ apiKey, account, path: "schedules.json" }),
  );
  const matches = schedules.filter(
    (schedule) => schedule.name.trim().toLowerCase() === account.trim().toLowerCase(),
  );
  if (matches.length !== 1) {
    const names = schedules.map((schedule) => schedule.name).join(", ") || "(nessuno)";
    throw new Error(
      matches.length === 0
        ? `Schedule SuperSaaS «${account}» non trovato. Schedule visibili: ${names}`
        : `Più schedule SuperSaaS chiamati «${account}». Import interrotto.`,
    );
  }
  const schedule = matches[0];
  const resources = parseIdNameList(
    await ssGet({
      apiKey,
      account,
      path: "resources.json",
      params: { schedule_id: schedule.id },
    }),
  );
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const from = formatRomeApi(new Date(now.getTime() - 12 * 60 * 60 * 1000));
  const rawBookings = await pageUntil({
    extract: extractBookings,
    load: (offset, limit) =>
      ssGet({
        apiKey,
        account,
        path: `range/${schedule.id}.json`,
        params: { from, limit, offset },
      }),
  });
  return { schedule, resources, resourcesById, rawBookings };
}

export function safeNormalizeBooking(raw, resourcesById) {
  try {
    return { ok: true, booking: normalizeSuperSaasBooking(raw, resourcesById) };
  } catch (error) {
    return {
      ok: false,
      externalId: String(raw?.id ?? "?"),
      message: error instanceof Error ? error.message : "prenotazione illeggibile",
    };
  }
}

export async function findSuperSaasUser({ apiKey, account, email }) {
  const target = normalizeEmail(email);
  const users = await pageUntil({
    extract: extractUsers,
    load: (offset, limit) =>
      ssGet({
        apiKey,
        account,
        path: "users.json",
        params: { limit, offset },
      }),
  });
  const matches = users.filter((user) => userMatchesEmail(user, target));
  if (matches.length > 1) {
    throw new Error(
      "Più utenti SuperSaaS con la stessa email. Import interrotto, nessuna prenotazione attribuita.",
    );
  }
  return matches[0] ?? null;
}
