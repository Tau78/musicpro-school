import { randomBytes } from "crypto";

const COD_TRANS_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Unique codTrans max 30 chars (Classic XPay). */
export function generateCodTrans(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date());
  const dd = parts.find((p) => p.type === "day")?.value ?? "00";
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  const yy = parts.find((p) => p.type === "year")?.value ?? "00";
  const prefix = `MP${dd}${mm}${yy}`;
  const need = Math.max(8, 30 - prefix.length);
  const bytes = randomBytes(need);
  let out = prefix;
  for (let i = 0; i < need; i++) {
    out += COD_TRANS_ALPHABET[bytes[i]! % COD_TRANS_ALPHABET.length];
  }
  return out.slice(0, 30);
}

export function nexiPublicPayPageUrl(codTrans: string): string {
  const base = (
    process.env.NEXI_PAY_PAGE_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://school.musicproeventi.it"
  )
    .trim()
    .replace(/\/$/, "");
  const path =
    (process.env.NEXI_PAY_PAGE_PATH || "/paga-nexi.html").trim() ||
    "/paga-nexi.html";
  const pathNorm = path.startsWith("/") ? path : `/${path}`;
  return `${base}${pathNorm}?t=${encodeURIComponent(codTrans)}`;
}

export function eurosToCents(amountEur: number): number {
  return Math.round(amountEur * 100);
}

export const QUOTA_ASSOCIATIVA_CENTESIMI = 1500;
