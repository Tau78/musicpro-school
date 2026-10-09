#!/usr/bin/env node
/**
 * Import ScuolaSemplice Ordini → member_annual_quotas (MusicPro School).
 *
 * Default: --dry-run (no writes). Use --write after Mauro confirms.
 *
 *   node scripts/import-scuola-semplice-quotas.mjs --file /path/Ordini.xls --dry-run
 *   node scripts/import-scuola-semplice-quotas.mjs --file /path/Ordini.xls --write
 *   node scripts/import-scuola-semplice-quotas.mjs --file … --write --create-missing
 *   node scripts/import-scuola-semplice-quotas.mjs --file … --write --tutor-links
 *   node scripts/import-scuola-semplice-quotas.mjs --file … --write --update-existing
 */
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(rootDir, "musicpro", ".env") });
dotenv.config({ path: path.join(rootDir, ".env") });

const {
  loadMemberLookup,
  resolveMemberIdFromQuoteName,
  resolveMemberId,
  upsertBatched,
} = require("./migrate-from-sheets/supabase-client.js");
const {
  normalizeTaxCode,
  normalizeWhitespace,
  parseQuoteName,
} = require("./migrate-from-sheets/utils.js");

const PARSE_PY = path.join(__dirname, "scuola-semplice", "parse_ordini.py");
const VENV_PY = path.join(__dirname, "scuola-semplice", ".venv", "bin", "python");

function parseArgs(argv) {
  const opts = {
    file: null,
    dryRun: true,
    write: false,
    createMissing: false,
    tutorLinks: false,
    updateExisting: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") opts.file = argv[++i];
    else if (a === "--dry-run") {
      opts.dryRun = true;
      opts.write = false;
    } else if (a === "--write") {
      opts.write = true;
      opts.dryRun = false;
    } else if (a === "--create-missing") opts.createMissing = true;
    else if (a === "--tutor-links") opts.tutorLinks = true;
    else if (a === "--update-existing") opts.updateExisting = true;
    else if (a === "--help" || a === "-h") opts.help = true;
  }
  return opts;
}

function ensurePython() {
  if (fs.existsSync(VENV_PY)) return VENV_PY;
  const venvDir = path.join(__dirname, "scuola-semplice", ".venv");
  console.log("Creating scripts/scuola-semplice/.venv + xlrd…");
  const py = spawnSync("python3", ["-m", "venv", venvDir], { encoding: "utf8" });
  if (py.status !== 0) {
    throw new Error(`venv failed: ${py.stderr || py.stdout}`);
  }
  const pip = spawnSync(
    path.join(venvDir, "bin", "pip"),
    ["install", "-q", "xlrd", "openpyxl"],
    { encoding: "utf8" },
  );
  if (pip.status !== 0) {
    throw new Error(`pip install failed: ${pip.stderr || pip.stdout}`);
  }
  return VENV_PY;
}

function parseOrdiniFile(filePath) {
  const py = ensurePython();
  const res = spawnSync(py, [PARSE_PY, filePath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`parse_ordini.py failed:\n${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout);
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchExistingQuotaKeys(supabase) {
  const keys = new Set();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("member_annual_quotas")
      .select("member_id, fiscal_year")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Load quotas: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) keys.add(`${row.member_id}|${row.fiscal_year}`);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return keys;
}

async function nextMemberNumber(supabase) {
  const { data, error } = await supabase
    .from("members")
    .select("member_number")
    .not("member_number", "is", null)
    .order("member_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`max member_number: ${error.message}`);
  return (data?.member_number ?? 0) + 1;
}

/** Spelling / ordine nome già in anagrafica School (chiave = normalizeWhitespace lower). */
const ALIASES = new Map(
  Object.entries({
    "viktoria gandolfo": "Viktoria Gandolfo",
    "vittoria gandolfo": "Viktoria Gandolfo",
    "aldo de roberti": "Aldo Roberti",
    "nicoli filippo": "Filippo Nicoli",
    "simone dimeglio": "Simone Di Meglio",
    "santoro sofia": "Sofia Santoro",
    "anita bezerra marquez": "Anita Bezerra Marques",
  }),
);

function expandQuotaPeople(quotas) {
  const out = [];
  for (const q of quotas) {
    const parts = String(q.allievo || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      out.push(q);
      continue;
    }
    for (const name of parts) {
      out.push({ ...q, allievo: name, source_row: `${q.source_row}:split` });
    }
  }
  return out;
}

function isBlank(v) {
  if (v == null) return true;
  if (typeof v === "string" && !v.trim()) return true;
  return false;
}

function saneBirthDate(v) {
  if (!v || typeof v !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const y = Number(v.slice(0, 4));
  if (y < 1920 || y > 2026) return null;
  return v;
}

async function createMinimalMember(supabase, fullName, extras, dryRun, memberNumber) {
  const parsed = parseQuoteName(fullName);
  if (!parsed.firstName) return null;
  const row = {
    first_name: parsed.firstName,
    last_name: parsed.lastName || parsed.firstName,
    email: extras.email || null,
    phone: extras.phone || null,
    tax_code: extras.tax_code || null,
    birth_date: saneBirthDate(extras.birth_date),
    address_street: extras.address_street || null,
    address_city: extras.address_city || null,
    address_postal_code: extras.address_postal_code || null,
    address_province: extras.address_province || null,
    birth_place: extras.birth_place || null,
    is_active: true,
    is_enrollment_draft: false,
    member_number: memberNumber ?? null,
  };
  if (dryRun) {
    return { id: `dry-run-${normalizeWhitespace(fullName).toLowerCase()}`, dry: true };
  }
  const { data, error } = await supabase.from("members").insert(row).select("id").single();
  if (error) throw new Error(`Create member ${fullName}: ${error.message}`);
  return data;
}

/** Riempie solo campi vuoti sull'associato già matchato (no overwrite). */
async function mergeAnagraficaIfEmpty(supabase, memberId, extras, dryRun) {
  if (!memberId || String(memberId).startsWith("dry-run")) return null;
  const { data: cur, error } = await supabase
    .from("members")
    .select(
      "id, email, phone, tax_code, birth_date, address_street, address_city, address_postal_code, address_province, birth_place",
    )
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw new Error(`Load member for merge: ${error.message}`);
  if (!cur) return null;

  const patch = {};
  const map = {
    email: extras.email,
    phone: extras.phone,
    tax_code: extras.tax_code,
    birth_date: saneBirthDate(extras.birth_date),
    address_street: extras.address_street,
    address_city: extras.address_city,
    address_postal_code: extras.address_postal_code,
    address_province: extras.address_province,
    birth_place: extras.birth_place,
  };
  for (const [k, v] of Object.entries(map)) {
    if (isBlank(cur[k]) && !isBlank(v)) patch[k] = v;
  }
  if (!Object.keys(patch).length) return null;
  if (dryRun) return patch;
  const { error: upErr } = await supabase.from("members").update(patch).eq("id", memberId);
  if (upErr) throw new Error(`Merge anagrafica: ${upErr.message}`);
  return patch;
}

async function ensureTutorLink(supabase, tutorId, wardId, dryRun) {
  if (!tutorId || !wardId || String(tutorId).startsWith("dry-run") || String(wardId).startsWith("dry-run")) {
    return;
  }
  if (tutorId === wardId) return;
  if (dryRun) return;
  const { data: existing } = await supabase
    .from("tutor_links")
    .select("id")
    .eq("tutor_member_id", tutorId)
    .eq("ward_member_id", wardId)
    .maybeSingle();
  if (existing) return;
  const { error } = await supabase.from("tutor_links").insert({
    tutor_member_id: tutorId,
    ward_member_id: wardId,
  });
  if (error) throw new Error(`tutor_links: ${error.message}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.file) {
    console.log(`Usage:
  node scripts/import-scuola-semplice-quotas.mjs --file /path/Ordini.xls [--dry-run|--write]
      [--create-missing] [--tutor-links] [--update-existing]`);
    process.exit(opts.help ? 0 : 2);
  }

  const filePath = path.resolve(opts.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log("=== ScuolaSemplice Ordini → member_annual_quotas ===");
  console.log(`File: ${filePath}`);
  console.log(`Mode: ${opts.write ? "WRITE" : "DRY-RUN"}`);

  const parsed = parseOrdiniFile(filePath);
  const quotas = expandQuotaPeople(parsed.quotas);
  console.log(
    `Parsed quota people: ${parsed.count} → ${quotas.length} after split multi-allievo`,
  );

  const lookup = await loadMemberLookup();
  const supabase = getSupabase();
  const existing = await fetchExistingQuotaKeys(supabase);
  let memberNumSeq = opts.createMissing ? await nextMemberNumber(supabase) : null;
  /** Evita doppie create nello stesso run (stesso allievo su più anni). */
  const createdByName = new Map();

  const report = {
    matched: [],
    unmatched: [],
    alreadyInDb: [],
    wouldInsert: [],
    wouldUpdate: [],
    aliases: [],
    mergedAnagrafica: [],
    tutors: { matched: 0, missing: 0 },
  };

  const upsertRows = [];

  for (const q of quotas) {
    let memberId = null;
    let matchType = null;
    const nameKey = normalizeWhitespace(q.allievo).toLowerCase();

    if (createdByName.has(nameKey)) {
      memberId = createdByName.get(nameKey);
      matchType = "created_earlier";
    }

    if (!memberId && q.cf_student) {
      const byCf = resolveMemberId(lookup, {
        taxCode: normalizeTaxCode(q.cf_student),
      });
      if (byCf) {
        memberId = byCf;
        matchType = "tax_code";
      }
    }
    if (!memberId) {
      const aliasTo = ALIASES.get(nameKey);
      if (aliasTo) {
        const r = resolveMemberIdFromQuoteName(lookup, aliasTo);
        if (r.id) {
          memberId = r.id;
          matchType = `alias:${aliasTo}`;
          report.aliases.push({ from: q.allievo, to: aliasTo, member_id: r.id });
        }
      }
    }
    if (!memberId) {
      const r = resolveMemberIdFromQuoteName(lookup, q.allievo);
      memberId = r.id;
      matchType = r.matchType;
    }

    const wardExtras = {
      email: q.kind === "associato_solo" ? q.email : null,
      phone: q.kind === "associato_solo" ? q.phone : null,
      tax_code: q.cf_student || null,
      birth_date: q.birth_date,
      address_street: q.address_street,
      address_city: q.address_city,
      address_postal_code: q.address_postal_code,
      address_province: q.address_province,
      birth_place: q.birth_place,
    };

    // Associato solo: se l'email esiste già, è quasi sempre la stessa persona.
    if (!memberId && q.kind === "associato_solo" && q.email) {
      const { data: byEmail } = await supabase
        .from("members")
        .select("id")
        .ilike("email", q.email)
        .maybeSingle();
      if (byEmail?.id) {
        memberId = byEmail.id;
        matchType = "email";
      }
    }

    if (!memberId && opts.createMissing) {
      let createExtras = { ...wardExtras };
      if (createExtras.email) {
        const { data: emailTaken } = await supabase
          .from("members")
          .select("id")
          .ilike("email", createExtras.email)
          .maybeSingle();
        if (emailTaken) createExtras = { ...createExtras, email: null };
      }
      const num = memberNumSeq++;
      const created = await createMinimalMember(
        supabase,
        q.allievo,
        createExtras,
        !opts.write,
        num,
      );
      if (created?.id) {
        memberId = created.id;
        matchType = "created";
        createdByName.set(nameKey, memberId);
      }
    }

    if (!memberId) {
      report.unmatched.push({
        allievo: q.allievo,
        tutore: q.tutore,
        fiscal_year: q.fiscal_year,
        paid_at: q.paid_at,
        email: q.email,
      });
      continue;
    }

    report.matched.push({
      allievo: q.allievo,
      member_id: memberId,
      matchType,
      fiscal_year: q.fiscal_year,
      paid_at: q.paid_at,
    });

    // Merge anagrafica: su associato_solo usa email/phone della riga;
    // su allievo/tutore solo CF allievo + indirizzo/nascita (no email tutore).
    const mergePatch = await mergeAnagraficaIfEmpty(
      supabase,
      memberId,
      wardExtras,
      !opts.write,
    );
    if (mergePatch) {
      report.mergedAnagrafica.push({
        allievo: q.allievo,
        member_id: memberId,
        fields: Object.keys(mergePatch),
      });
    }

    if (opts.tutorLinks && q.tutore) {
      const tutorKey = normalizeWhitespace(q.tutore).toLowerCase();
      let tutorId = createdByName.get(`tutor:${tutorKey}`) || null;
      if (!tutorId) {
        tutorId = resolveMemberIdFromQuoteName(lookup, q.tutore).id;
      }
      if (!tutorId && q.cf_suspect_tutor) {
        tutorId = resolveMemberId(lookup, {
          taxCode: normalizeTaxCode(q.cf_suspect_tutor),
        });
      }
      // Email già in anagrafica: spesso è sull'allievo (import vecchio).
      // Se il nome combacia col tutore → usa quel membro; altrimenti non riusarla in create.
      let tutorEmail = q.email || null;
      let emailOwnerId = null;
      if (!tutorId && tutorEmail) {
        const { data: byEmail } = await supabase
          .from("members")
          .select("id, first_name, last_name, email")
          .ilike("email", tutorEmail)
          .maybeSingle();
        if (byEmail) {
          emailOwnerId = byEmail.id;
          const ownerName =
            `${byEmail.first_name || ""} ${byEmail.last_name || ""}`.trim();
          const tutorParsed = parseQuoteName(q.tutore);
          const ownerParsed = parseQuoteName(ownerName);
          const samePerson =
            normalizeWhitespace(ownerName).toLowerCase() === tutorKey ||
            (tutorParsed.lastName &&
              ownerParsed.lastName &&
              normalizeWhitespace(tutorParsed.lastName).toLowerCase() ===
                normalizeWhitespace(ownerParsed.lastName).toLowerCase() &&
              normalizeWhitespace(tutorParsed.firstName || "")
                .toLowerCase()
                .startsWith(
                  normalizeWhitespace(ownerParsed.firstName || "")
                    .toLowerCase()
                    .slice(0, 3),
                ));
          if (samePerson) {
            tutorId = byEmail.id;
            matchType = `${matchType}+tutor_email`;
          } else {
            tutorEmail = null; // email già sull'allievo o altro: create senza email
          }
        }
      }
      if (!tutorId && opts.createMissing) {
        const t = await createMinimalMember(
          supabase,
          q.tutore,
          {
            email: tutorEmail,
            phone: q.phone,
            tax_code: q.cf_suspect_tutor || null,
          },
          !opts.write,
          memberNumSeq++,
        );
        tutorId = t?.id || null;
        if (tutorId) createdByName.set(`tutor:${tutorKey}`, tutorId);
      }
      if (tutorId) {
        report.tutors.matched++;
        await ensureTutorLink(supabase, tutorId, memberId, !opts.write);
        const tutorMerge = await mergeAnagraficaIfEmpty(
          supabase,
          tutorId,
          {
            email: tutorEmail,
            phone: q.phone,
            tax_code: q.cf_suspect_tutor || null,
          },
          !opts.write,
        );
        if (tutorMerge) {
          report.mergedAnagrafica.push({
            allievo: `tutore:${q.tutore}`,
            member_id: tutorId,
            fields: Object.keys(tutorMerge),
          });
        }
      } else {
        report.tutors.missing++;
      }
    }

    const key = `${memberId}|${q.fiscal_year}`;
    const row = {
      member_id: memberId,
      fiscal_year: q.fiscal_year,
      paid_at: q.paid_at ? `${q.paid_at}T12:00:00+01:00` : null,
      amount_paid_eur: q.quota_amount_eur,
      notes: `ScuolaSemplice Ordini row ${q.source_row}${q.bundled_with_lessons ? " (bundled)" : ""}`,
    };

    if (existing.has(key)) {
      report.alreadyInDb.push({ allievo: q.allievo, fiscal_year: q.fiscal_year });
      if (opts.updateExisting) {
        report.wouldUpdate.push(row);
        upsertRows.push(row);
      }
    } else {
      report.wouldInsert.push(row);
      upsertRows.push(row);
      existing.add(key);
    }
  }

  console.log("\n--- Report ---");
  console.log(`Matched:     ${report.matched.length}`);
  console.log(`Unmatched:   ${report.unmatched.length}`);
  console.log(`Already DB:  ${report.alreadyInDb.length}`);
  console.log(`Would insert:${report.wouldInsert.length}`);
  console.log(`Would update:${report.wouldUpdate.length}`);
  console.log(`Aliases used:${report.aliases.length}`);
  console.log(`Anagrafica merge patches:${report.mergedAnagrafica.length}`);
  console.log(
    `Created this run: ${[...createdByName.keys()].filter((k) => !k.startsWith("tutor:")).length} allievi + ${[...createdByName.keys()].filter((k) => k.startsWith("tutor:")).length} tutori`,
  );
  if (opts.tutorLinks) {
    console.log(`Tutors hit/miss: ${report.tutors.matched}/${report.tutors.missing}`);
  }
  if (report.aliases.length) {
    const uniq = [...new Map(report.aliases.map((a) => [a.from, a])).values()];
    console.log("\nAlias (no new member):");
    for (const a of uniq) console.log(`  ${a.from} → ${a.to}`);
  }

  if (report.unmatched.length) {
    console.log("\nUnmatched (need member or --create-missing):");
    for (const u of report.unmatched.slice(0, 40)) {
      console.log(
        `  - ${u.allievo}${u.tutore ? " / " + u.tutore : ""} | ${u.fiscal_year} | ${u.paid_at} | ${u.email}`,
      );
    }
    if (report.unmatched.length > 40) {
      console.log(`  … +${report.unmatched.length - 40} more`);
    }
  }

  if (opts.write && upsertRows.length) {
    const result = await upsertBatched(
      "member_annual_quotas",
      upsertRows,
      "member_id,fiscal_year",
      false,
    );
    console.log(`\nWritten: ${result.count} row(s) → member_annual_quotas`);
  } else if (!opts.write) {
    console.log("\nDry-run only. Re-run with --write after Mauro OK.");
  } else {
    console.log("\nNothing to write.");
  }

  const outPath = path.join(rootDir, "tmp", "ss-quotas-import-report.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    JSON.stringify({ opts, source: parsed.source, report }, null, 2),
  );
  console.log(`Report JSON: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
