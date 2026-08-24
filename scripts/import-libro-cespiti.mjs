#!/usr/bin/env node
/**
 * Import Libro Cespiti from ODS (Google Drive export).
 * Usage: node scripts/import-libro-cespiti.mjs [path/to/Libro Cespiti.ods]
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const DEFAULT_ODS_CANDIDATES = [
  path.join(
    os.homedir(),
    "Library/CloudStorage/GoogleDrive-andreoni.mauro@gmail.com/Drive condivisi/MusicPro/MusicPro/Documenti/Sede/Libro Cespiti.ods",
  ),
  path.join(
    os.homedir(),
    "Library/CloudStorage/GoogleDrive-mauro@musicproeventi.it/My Drive/MusicPro School/Documenti/Libro Cespiti.ods",
  ),
  path.join(
    os.homedir(),
    "Google Drive/My Drive/MusicPro School/Documenti/Libro Cespiti.ods",
  ),
  path.join(rootDir, "data/Libro Cespiti.ods"),
];

const LOCATION_MAP = {
  "sala arancio": "sala_arancio",
  "sala blu": "sala_blu",
  "sala verde": "sala_verde",
  "sala rossa": "sala_rossa",
  ingresso: "ingresso",
  magazzino: "magazzino",
  box: "box",
  altro: "altro",
};

const ACCESSORY_PATTERNS = [
  { key: "cavo_segnale", patterns: [/cavo\s*segnale/i, /jack/i, /xlr/i] },
  {
    key: "cavo_alimentazione",
    patterns: [/cavo\s*aliment/i, /cavo\s*corrente/i, /power\s*cord/i],
  },
  {
    key: "cavo_potenza",
    patterns: [/cavo\s*potenza/i, /speaker\s*cable/i, /cavo\s*altoparl/i],
  },
  { key: "alimentatore", patterns: [/alimentator/i, /power\s*supply/i, /psu/i] },
  { key: "leggio", patterns: [/leggio/i, /stand/i] },
  { key: "footswitch", patterns: [/footswitch/i, /foot\s*switch/i, /pedale/i] },
  { key: "custodia", patterns: [/custodia/i, /case/i, /bag/i] },
  { key: "cavo", patterns: [/\bcavo\b/i, /\bcavi\b/i] },
  { key: "microfono", patterns: [/microfon/i, /\bmic\b/i] },
  { key: "manuale", patterns: [/manuale/i] },
  { key: "chiave", patterns: [/chiav/i] },
  { key: "batteria", patterns: [/batter/i] },
  { key: "caricabatterie", patterns: [/caricabatter/i, /charger/i] },
  { key: "supporto", patterns: [/supporto/i, /mount/i] },
  { key: "telecomando", patterns: [/telecomando/i, /remote/i] },
  { key: "tracolla", patterns: [/tracolla/i, /strap/i] },
];

const COLUMN_ALIASES = {
  quantity: ["n. pezzi", "n pezzi", "pezzi", "quantita", "quantità"],
  name: ["nome", "descrizione", "bene"],
  brand: ["marca", "brand"],
  model: ["modello", "model"],
  serial: ["seriale", "serial", "n. serie", "numero di serie"],
  accessories: ["accessori", "accessory"],
  purchasedAt: ["data acquisto", "acquisto", "data"],
  location: ["posizione", "ubicazione", "location", "sala"],
};

function resolveOdsPath(argPath) {
  if (argPath) {
    const resolved = path.resolve(argPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`File ODS non trovato: ${resolved}`);
    }
    return resolved;
  }

  for (const candidate of DEFAULT_ODS_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    `File ODS non trovato. Passa il percorso come argomento oppure copia il file in uno di:\n${DEFAULT_ODS_CANDIDATES.map((p) => `- ${p}`).join("\n")}`,
  );
}

function getSupabase() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY richiesti in musicpro/.env",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function decodeXmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractOdsContentXml(odsPath) {
  try {
    return execFileSync("unzip", ["-p", odsPath, "content.xml"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `Impossibile leggere content.xml da ${odsPath}. Serve il comando unzip nel PATH. ${error instanceof Error ? error.message : ""}`,
    );
  }
}

function readCellText(cellXml) {
  const paragraphs = [...cellXml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)];
  if (paragraphs.length > 0) {
    return decodeXmlEntities(
      paragraphs.map((match) => match[1].replace(/<[^>]+>/g, "")).join(" ").trim(),
    );
  }

  const valueMatch = cellXml.match(/office:value="([^"]*)"/);
  if (valueMatch) return decodeXmlEntities(valueMatch[1].trim());

  const dateMatch = cellXml.match(/office:date-value="([^"]*)"/);
  if (dateMatch) return dateMatch[1].trim();

  return "";
}

function parseOdsRows(contentXml) {
  const rows = [];
  const rowMatches = [...contentXml.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)];

  for (const rowMatch of rowMatches) {
    const rowXml = rowMatch[1];
    const cells = [];
    const cellMatches = [...rowXml.matchAll(/<table:table-cell[^>]*(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)];

    for (const cellMatch of cellMatches) {
      const cellTag = cellMatch[0];
      const repeatMatch = cellTag.match(/table:number-columns-repeated="(\d+)"/);
      const repeat = repeatMatch ? Number.parseInt(repeatMatch[1], 10) : 1;
      const text = readCellText(cellMatch[0]);
      for (let i = 0; i < repeat; i += 1) {
        cells.push(text);
      }
    }

    if (cells.some((cell) => cell.trim() !== "")) {
      rows.push(cells);
    }
  }

  return rows;
}

function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function findColumnIndex(headers, aliases) {
  for (let i = 0; i < headers.length; i += 1) {
    const header = normalizeHeader(headers[i] ?? "");
    if (aliases.some((alias) => header.includes(alias))) return i;
  }
  return -1;
}

function parseQuantity(value) {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function parsePurchasedAt(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function mapLocation(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { locationPreset: null, locationCustom: null };

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  for (const [label, preset] of Object.entries(LOCATION_MAP)) {
    if (normalized.includes(label)) {
      const custom = normalized === label ? null : raw;
      return { locationPreset: preset, locationCustom: custom };
    }
  }

  return { locationPreset: "altro", locationCustom: raw };
}

function mapAccessories(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return [];

  const found = new Set();
  for (const entry of ACCESSORY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      found.add(entry.key);
    }
  }

  return [...found].sort((a, b) => a.localeCompare(b, "it"));
}

function normalizeBrand(value) {
  if (value == null) return null;
  return String(value).trim();
}

function normalizeOptionalText(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
}

function normalizeSerial(value) {
  const normalized = normalizeOptionalText(value);
  if (normalized == null || normalized === "-") return null;
  return normalized;
}

function normalizeAccessories(accessories) {
  return [...new Set(accessories.map((item) => item.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "it"),
  );
}

function toComparable(row) {
  return {
    name: row.name.trim(),
    brand: row.brand ?? "",
    model: row.model?.trim() ?? "",
    serial: row.serial ?? "",
    accessories: row.accessories.join("\0"),
    locationPreset: row.locationPreset ?? "",
    locationCustom: row.locationCustom?.trim() ?? "",
    purchasedAt: row.purchasedAt ?? "",
  };
}

function isExactDuplicate(a, b) {
  const left = toComparable(a);
  const right = toComparable(b);
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function rowsToRecords(rows) {
  if (rows.length === 0) return [];

  const headers = rows[0];
  const indexes = {
    quantity: findColumnIndex(headers, COLUMN_ALIASES.quantity),
    name: findColumnIndex(headers, COLUMN_ALIASES.name),
    brand: findColumnIndex(headers, COLUMN_ALIASES.brand),
    model: findColumnIndex(headers, COLUMN_ALIASES.model),
    serial: findColumnIndex(headers, COLUMN_ALIASES.serial),
    accessories: findColumnIndex(headers, COLUMN_ALIASES.accessories),
    purchasedAt: findColumnIndex(headers, COLUMN_ALIASES.purchasedAt),
    location: findColumnIndex(headers, COLUMN_ALIASES.location),
  };

  if (indexes.name < 0) {
    throw new Error("Colonna Nome non trovata nel foglio ODS.");
  }

  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const name = normalizeOptionalText(row[indexes.name] ?? "");
    if (!name) continue;

    const location = mapLocation(indexes.location >= 0 ? row[indexes.location] : "");
    records.push({
      quantity: parseQuantity(indexes.quantity >= 0 ? row[indexes.quantity] : "1"),
      name,
      brand: normalizeBrand(indexes.brand >= 0 ? row[indexes.brand] : ""),
      model: normalizeOptionalText(indexes.model >= 0 ? row[indexes.model] : ""),
      serial: normalizeSerial(indexes.serial >= 0 ? row[indexes.serial] : ""),
      accessories: mapAccessories(
        indexes.accessories >= 0 ? row[indexes.accessories] : "",
      ),
      purchasedAt: parsePurchasedAt(
        indexes.purchasedAt >= 0 ? row[indexes.purchasedAt] : "",
      ),
      locationPreset: location.locationPreset,
      locationCustom: location.locationCustom,
    });
  }

  return records;
}

async function loadExistingAssets(supabase) {
  const { data, error } = await supabase
    .from("fixed_assets")
    .select(
      "id, quantity, name, brand, model, serial, accessories, purchased_at, location_preset, location_custom",
    )
    .is("deleted_at", null)
    .is("disposed_at", null);

  if (error) {
    throw new Error(`Impossibile caricare cespiti esistenti: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    quantity: row.quantity,
    name: row.name,
    brand: row.brand,
    model: row.model,
    serial: normalizeSerial(row.serial),
    accessories: normalizeAccessories(row.accessories ?? []),
    purchasedAt: row.purchased_at,
    locationPreset: row.location_preset,
    locationCustom: row.location_custom,
  }));
}

async function main() {
  const odsPath = resolveOdsPath(process.argv[2]);
  console.log(`Lettura ODS: ${odsPath}`);

  const contentXml = extractOdsContentXml(odsPath);
  const rows = parseOdsRows(contentXml);
  const records = rowsToRecords(rows);
  console.log(`Righe parse: ${records.length}`);

  const supabase = getSupabase();
  const existing = await loadExistingAssets(supabase);
  const serialIndex = new Map();
  for (const asset of existing) {
    if (asset.serial) {
      const list = serialIndex.get(asset.serial) ?? [];
      list.push(asset);
      serialIndex.set(asset.serial, list);
    }
  }

  let inserted = 0;
  let skippedExact = 0;
  let serialWarnings = 0;

  for (const record of records) {
    if (existing.some((asset) => isExactDuplicate(asset, record))) {
      skippedExact += 1;
      console.log(`SKIP exact duplicate: ${record.name}`);
      continue;
    }

    if (record.serial) {
      const matches = serialIndex.get(record.serial) ?? [];
      if (matches.length > 0) {
        serialWarnings += 1;
        console.warn(
          `WARN duplicate serial ${record.serial} for "${record.name}" (existing: ${matches.map((m) => m.name).join(", ")})`,
        );
      }
    }

    const { error } = await supabase.from("fixed_assets").insert({
      quantity: record.quantity,
      name: record.name,
      brand: record.brand,
      model: record.model,
      serial: record.serial,
      accessories: record.accessories,
      purchased_at: record.purchasedAt,
      location_preset: record.locationPreset,
      location_custom: record.locationCustom,
    });

    if (error) {
      console.error(`ERR insert "${record.name}": ${error.message}`);
      continue;
    }

    inserted += 1;
    existing.push(record);
    if (record.serial) {
      const list = serialIndex.get(record.serial) ?? [];
      list.push(record);
      serialIndex.set(record.serial, list);
    }
  }

  console.log(
    `Import completato. Inseriti: ${inserted}, skip duplicati esatti: ${skippedExact}, warning seriali: ${serialWarnings}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
