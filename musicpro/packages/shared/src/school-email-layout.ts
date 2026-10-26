/**
 * Guscio HTML MusicPro School per email transazionali.
 * Logo su navy, CTA testo bianco, footer sito + social + app.
 */

export const SCHOOL_BRAND_NAVY = "#1e3a5f";
export const SCHOOL_BRAND_GOLD = "#c9a227";
export const SCHOOL_BRAND_NAVY_DARK = "#0c1828";

export const SCHOOL_SITE_URL = "https://www.musicproeventi.it";
export const SCHOOL_APP_URL = "https://school.musicproeventi.it";
export const SCHOOL_APP_STORE_URL =
  "https://apps.apple.com/it/app/musicpro-school/id6806407450";
export const SCHOOL_INSTAGRAM_URL = "https://www.instagram.com/musicproeventi/";
export const SCHOOL_FACEBOOK_URL = "https://www.facebook.com/musicproeventi";
export const SCHOOL_YOUTUBE_URL =
  "https://www.youtube.com/channel/UCJ6ubmJot2vGjyU9hA56BGw";

const LOGO_PATH = "/images/receipt-assoc-logo.png";

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function schoolLogoUrl(appOrigin: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}${LOGO_PATH}`;
}

export interface SchoolEmailCta {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
}

export interface WrapSchoolEmailInput {
  appOrigin: string;
  preheader?: string;
  kicker?: string;
  title: string;
  htmlBody: string;
  ctas?: SchoolEmailCta[];
  /** Footer app download — default true per mail all'associato. */
  showAppDownload?: boolean;
}

function ctaHtml(cta: SchoolEmailCta): string {
  const href = escapeEmailHtml(cta.href);
  const label = escapeEmailHtml(cta.label);
  if (cta.variant === "secondary") {
    return `<a href="${href}" style="display:inline-block;background:#ffffff;color:${SCHOOL_BRAND_NAVY};text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;border:2px solid ${SCHOOL_BRAND_NAVY};">${label}</a>`;
  }
  return `<a href="${href}" style="display:inline-block;background:${SCHOOL_BRAND_NAVY};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;font-size:14px;">${label}</a>`;
}

/** Card evidenza (sala + orario) sopra il riepilogo. */
export function schoolEmailHeroHtml(
  kicker: string,
  title: string,
  subtitle: string,
  detail?: string,
): string {
  const detailLine = detail
    ? `<p style="margin:6px 0 0;font-size:18px;line-height:1.3;font-weight:700;color:${SCHOOL_BRAND_NAVY};">${escapeEmailHtml(detail)}</p>`
    : "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;">
    <tr>
      <td style="background:#f6f3ec;border-radius:12px;padding:18px 16px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${SCHOOL_BRAND_GOLD};font-weight:700;">${escapeEmailHtml(kicker)}</p>
        <p style="margin:0 0 8px;font-size:26px;line-height:1.2;font-weight:800;color:${SCHOOL_BRAND_NAVY};">${escapeEmailHtml(title)}</p>
        <p style="margin:0;font-size:14px;line-height:1.4;color:#374151;">${escapeEmailHtml(subtitle)}</p>
        ${detailLine}
      </td>
    </tr>
  </table>`;
}

/** Paragrafi da testo piano, per wrappare mail già scritte. */
export function schoolEmailBodyFromText(text: string): string {
  const blocks = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks
    .map((block) => {
      const inner = escapeEmailHtml(block).replace(/\r\n|\r|\n/g, "<br />");
      return `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#1a1a1a;">${inner}</p>`;
    })
    .join("");
}

export function wrapSchoolEmail(input: WrapSchoolEmailInput): string {
  const logoOrigin =
    input.appOrigin.includes("localhost") || input.appOrigin.includes("127.0.0.1")
      ? SCHOOL_APP_URL
      : input.appOrigin.replace(/\/$/, "") || SCHOOL_APP_URL;
  const logo = escapeEmailHtml(schoolLogoUrl(logoOrigin));
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeEmailHtml(input.preheader)}</div>`
    : "";
  const kicker = input.kicker
    ? `<p style="margin:0 0 6px;color:${SCHOOL_BRAND_GOLD};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">${escapeEmailHtml(input.kicker)}</p>`
    : "";
  const ctas = (input.ctas ?? []).filter((c) => c.href && c.label);
  const ctaBlock =
    ctas.length > 0
      ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 0;">${ctas
          .map(
            (cta) =>
              `<tr><td style="padding:0 0 10px;">${ctaHtml(cta)}</td></tr>`,
          )
          .join("")}</table>`
      : "";
  const appBlock =
    input.showAppDownload === false
      ? ""
      : `<tr>
      <td style="padding:8px 28px 28px;background:#ffffff;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ec;border-radius:12px;">
          <tr>
            <td style="padding:18px 20px;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${SCHOOL_BRAND_NAVY};">Porta la scuola nello smartphone</p>
              <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:#374151;">Prenota sala, lezioni e crediti dallo smartphone.</p>
              <a href="${escapeEmailHtml(SCHOOL_APP_STORE_URL)}" style="display:inline-block;background:${SCHOOL_BRAND_NAVY};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:700;font-size:14px;">Scarica l'app</a>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.45;color:#6b7280;">Oppure apri <a href="${escapeEmailHtml(SCHOOL_APP_URL)}" style="color:${SCHOOL_BRAND_NAVY};font-weight:700;text-decoration:none;">school.musicproeventi.it</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeEmailHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8e4d8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  ${preheader}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8e4d8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ddd6c4;">
          <tr>
            <td align="center" style="background:${SCHOOL_BRAND_NAVY};padding:22px 24px 16px;">
              <a href="${escapeEmailHtml(SCHOOL_SITE_URL)}" style="text-decoration:none;">
                <img src="${logo}" width="220" alt="MusicPro School" style="display:block;margin:0 auto;width:220px;max-width:80%;height:auto;border:0;" />
              </a>
              <p style="margin:10px 0 0;color:${SCHOOL_BRAND_GOLD};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;font-weight:700;">School</p>
            </td>
          </tr>
          <tr>
            <td style="height:4px;line-height:4px;background:${SCHOOL_BRAND_GOLD};font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;background:#ffffff;">
              ${kicker}
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${SCHOOL_BRAND_NAVY};font-weight:700;">${escapeEmailHtml(input.title)}</h1>
              ${input.htmlBody}
              ${ctaBlock}
            </td>
          </tr>
          ${appBlock}
          <tr>
            <td style="background:${SCHOOL_BRAND_NAVY_DARK};padding:22px 28px 26px;">
              <p style="margin:0 0 10px;font-size:13px;line-height:1.5;">
                <a href="${escapeEmailHtml(SCHOOL_SITE_URL)}" style="color:${SCHOOL_BRAND_GOLD};text-decoration:none;font-weight:700;">www.musicproeventi.it</a>
                <span style="color:#7a8796;"> · </span>
                <a href="${escapeEmailHtml(SCHOOL_APP_URL)}" style="color:#ffffff;text-decoration:none;">school.musicproeventi.it</a>
              </p>
              <p style="margin:0 0 12px;font-size:13px;line-height:1.6;">
                <a href="${escapeEmailHtml(SCHOOL_INSTAGRAM_URL)}" style="color:#ffffff;text-decoration:none;">Instagram</a>
                <span style="color:#7a8796;"> · </span>
                <a href="${escapeEmailHtml(SCHOOL_FACEBOOK_URL)}" style="color:#ffffff;text-decoration:none;">Facebook</a>
                <span style="color:#7a8796;"> · </span>
                <a href="${escapeEmailHtml(SCHOOL_YOUTUBE_URL)}" style="color:#ffffff;text-decoration:none;">YouTube</a>
              </p>
              <p style="margin:0;font-size:11px;line-height:1.45;color:#8b97a6;">Associazione Culturale MusicPro · Zona Loreto 42, Carasco (GE)</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function schoolEmailTextFooter(options?: { showAppDownload?: boolean }): string {
  const lines = [
    "",
    "—",
    "MusicPro School",
    SCHOOL_SITE_URL,
    SCHOOL_APP_URL,
    `Instagram: ${SCHOOL_INSTAGRAM_URL}`,
    `Facebook: ${SCHOOL_FACEBOOK_URL}`,
    `YouTube: ${SCHOOL_YOUTUBE_URL}`,
  ];
  if (options?.showAppDownload !== false) {
    lines.push(`Scarica l'app: ${SCHOOL_APP_STORE_URL}`);
  }
  return lines.join("\n");
}
