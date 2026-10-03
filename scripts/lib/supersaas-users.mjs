/**
 * Classificazione utenti SuperSaaS → associati MusicPro.
 * Le password non entrano nel piano stampabile.
 */
import { createRequire } from "module";

import { normalizeEmail } from "./supersaas-bookings.mjs";

const require = createRequire(import.meta.url);
const { normalizeForMatching, firstNamesCompatible } = require(
  "../migrate-from-sheets/utils.js",
);

export const SUPERSASS_CREDIT_REASON_PREFIX = "SuperSaaS saldo";

export function nameTokens(value) {
  return normalizeForMatching(value).split(" ").filter(Boolean);
}

export function nameTokenKey(value) {
  const tokens = nameTokens(value);
  if (tokens.length < 2) return "";
  return [...tokens].sort().join(" ");
}

export function splitPersonName(fullName) {
  const parts = String(fullName ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (parts.length < 2) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function parseEuroAmount(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  const cleaned = String(value).replace(/[€\s]/g, "").replace(",", ".");
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function cellText(cellXml) {
  const data = cellXml.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i);
  if (!data) return "";
  return data[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function rowCells(rowXml) {
  const cells = [];
  let col = 1;
  const cellRe = /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>/gi;
  let match = cellRe.exec(rowXml);
  while (match) {
    const index = match[1].match(/\bIndex="(\d+)"/i);
    if (index) col = Number(index[1]);
    cells[col] = cellText(match[2]);
    col += 1;
    match = cellRe.exec(rowXml);
  }
  return cells;
}

/**
 * Export utenti SuperSaaS (SpreadsheetML). La password resta sul record
 * solo per la scrittura Auth; i riepiloghi usano passwordChars.
 */
export function parseSuperSaasUserExport(xml) {
  const rows = [];
  const rowRe = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
  let match = rowRe.exec(xml);
  const parsed = [];
  while (match) {
    parsed.push(rowCells(match[1]));
    match = rowRe.exec(xml);
  }
  if (!parsed.length) return rows;

  const header = parsed[0];
  const col = (label) => header.findIndex((value) => value === label);
  const loginCol = col("Nome utente");
  const passwordCol = col("Password");
  const nameCol = col("Nome e cognome");
  const phoneCol = col("Cellulare");
  const creditCol = col("Saldo");
  const createdCol = col("Creato il");
  const groupCol = col("Gruppo");
  if (loginCol < 1 || nameCol < 1) {
    throw new Error("Export utenti SuperSaaS: intestazioni Nome utente o Nome e cognome assenti.");
  }

  for (const cells of parsed.slice(1)) {
    const email = normalizeEmail(cells[loginCol]);
    const fullName = String(cells[nameCol] ?? "").replace(/\s+/g, " ").trim();
    if (!email || !fullName) continue;
    rows.push({
      email,
      fullName,
      phone: String(cells[phoneCol] ?? "").trim(),
      creditEur: parseEuroAmount(cells[creditCol]),
      createdAt: String(cells[createdCol] ?? "").trim(),
      group: String(cells[groupCol] ?? "").trim(),
      password: passwordCol > 0 ? String(cells[passwordCol] ?? "") : "",
    });
  }
  return rows;
}

export function enrollmentIsPaid(row) {
  if (row?.paid_at) return true;
  const status = String(row?.payment_status ?? "").toLowerCase();
  const amount = Number(row?.amount_centesimi ?? 0);
  const paid = Number(row?.payment_total_centesimi ?? 0);
  if (paid > 0) return true;
  return amount > 0 && /pagat|paid|succeed|complet/.test(status);
}

export function quotaIsPaid(row) {
  if (row?.paid_at) return true;
  return Number(row?.amount_paid_eur ?? 0) > 0;
}

function memberName(member) {
  return `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();
}

function uniqueMembers(list) {
  const byId = new Map();
  for (const member of list) {
    if (member?.id) byId.set(member.id, member);
  }
  return [...byId.values()];
}

function compatibleMembers(fullName, members) {
  const parts = nameTokens(fullName);
  if (parts.length < 2) return [];
  const given = parts[0];
  const family = parts.slice(1).join(" ");
  const givenSwapped = parts[parts.length - 1];
  const familySwapped = parts.slice(0, -1).join(" ");
  return members.filter((member) => {
    const first = nameTokens(member.first_name).join(" ");
    const last = nameTokens(member.last_name).join(" ");
    if (!first || !last) return false;
    const direct = firstNamesCompatible(given, first) && family === last;
    const swapped = firstNamesCompatible(givenSwapped, first) && familySwapped === last;
    return direct || swapped;
  });
}

/**
 * @param {object} user email, fullName, creditEur
 * @param {{ members: object[], enrollments: object[], quotas: object[] }} catalog
 */
export function classifySuperSaasUser(user, catalog) {
  const email = normalizeEmail(user.email);
  const members = catalog.members ?? [];
  const enrollments = catalog.enrollments ?? [];
  const base = {
    email,
    fullName: user.fullName,
    group: user.group ?? "",
    creditEur: user.creditEur ?? 0,
    passwordChars: String(user.password ?? "").length,
  };

  const byEmail = uniqueMembers(
    members.filter((member) => normalizeEmail(member.email) === email),
  );
  if (byEmail.length === 1) {
    return {
      ...base,
      decision: "found_email",
      memberId: byEmail[0].id,
      detail: `${byEmail[0].first_name} ${byEmail[0].last_name}`.trim(),
    };
  }
  if (byEmail.length > 1) {
    return { ...base, decision: "ambiguous", detail: "più associati con la stessa email" };
  }

  const tokenKey = nameTokenKey(user.fullName);
  const byName = tokenKey
    ? uniqueMembers(members.filter((member) => nameTokenKey(memberName(member)) === tokenKey))
    : [];
  const byCompatible = uniqueMembers(compatibleMembers(user.fullName, members));
  const named = uniqueMembers([...byName, ...byCompatible]);
  if (named.length === 1) {
    return {
      ...base,
      decision: "found_name",
      memberId: named[0].id,
      detail: `${named[0].first_name} ${named[0].last_name}`.trim(),
    };
  }
  if (named.length > 1) {
    return { ...base, decision: "ambiguous", detail: "più associati con lo stesso nome" };
  }

  const paid = enrollments.filter((row) => {
    if (!enrollmentIsPaid(row)) return false;
    if (normalizeEmail(row.email) === email) return true;
    const enrollmentName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    return Boolean(tokenKey) && nameTokenKey(enrollmentName) === tokenKey;
  });

  const linkedIds = [...new Set(paid.map((row) => row.member_id).filter(Boolean))];
  if (linkedIds.length === 1) {
    const member = members.find((row) => row.id === linkedIds[0]);
    return {
      ...base,
      decision: "found_enrollment",
      memberId: linkedIds[0],
      detail: member ? `${member.first_name} ${member.last_name}`.trim() : "iscrizione già collegata",
      quotaYears: [...new Set(paid.map((row) => row.fiscal_year).filter(Boolean))].sort(),
    };
  }
  if (linkedIds.length > 1) {
    return { ...base, decision: "ambiguous", detail: "versamenti collegati a associati diversi" };
  }

  if (paid.length > 0) {
    return {
      ...base,
      decision: "create",
      detail: "nessun associato, quota versata",
      quotaYears: [...new Set(paid.map((row) => row.fiscal_year).filter(Boolean))].sort(),
      enrollments: paid,
    };
  }

  return { ...base, decision: "ignore", detail: "nessuna quota versata" };
}

export function summarizeUserPlans(plans) {
  const count = (decision) => plans.filter((row) => row.decision === decision).length;
  const creditOf = (decision) =>
    Math.round(
      plans
        .filter((row) => row.decision === decision)
        .reduce((sum, row) => sum + Number(row.creditEur || 0), 0) * 100,
    ) / 100;
  return {
    totale: plans.length,
    trovatiEmail: count("found_email"),
    trovatiNome: count("found_name"),
    trovatiIscrizione: count("found_enrollment"),
    daCreare: count("create"),
    ignorati: count("ignore"),
    ambigui: count("ambiguous"),
    creditoTrovati: creditOf("found_email") + creditOf("found_name") + creditOf("found_enrollment"),
    creditoDaCreare: creditOf("create"),
    creditoIgnorato: creditOf("ignore"),
  };
}

export function creditReason(email) {
  return `${SUPERSASS_CREDIT_REASON_PREFIX} ${normalizeEmail(email)}`;
}
