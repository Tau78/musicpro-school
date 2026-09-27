/** Classic XPay (pagamento semplice) — Alias + MAC. Non NPG. */

export const NEXI_DIVISA_EUR = 'EUR';

const DISPATCHER_TEST = 'https://int-ecommerce.nexi.it/ecomm/ecomm/DispatcherServlet';
const DISPATCHER_PROD = 'https://ecommerce.nexi.it/ecomm/ecomm/DispatcherServlet';

export type NexiXpayConfig = {
  alias: string;
  macKey: string;
  env: 'test' | 'prod';
  dispatcherUrl: string;
};

export function loadNexiXpayConfig(): NexiXpayConfig | null {
  const alias = (Deno.env.get('NEXI_XPAY_ALIAS') ?? Deno.env.get('NEXI_ALIAS') ?? '').trim();
  const macKey = (Deno.env.get('NEXI_XPAY_MAC_KEY') ?? Deno.env.get('NEXI_MAC_KEY') ?? '').trim();
  if (!alias || !macKey) return null;
  const envRaw = (Deno.env.get('NEXI_XPAY_ENV') ?? Deno.env.get('NEXI_ENV') ?? 'test')
    .trim()
    .toLowerCase();
  const env: 'test' | 'prod' = envRaw === 'prod' || envRaw === 'production' ? 'prod' : 'test';
  return {
    alias,
    macKey,
    env,
    dispatcherUrl: env === 'prod' ? DISPATCHER_PROD : DISPATCHER_TEST,
  };
}

export async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-1', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** MAC avvio: SHA1(codTrans=…divisa=…importo=… + chiave) */
export async function macPaymentRequest(
  macKey: string,
  codTrans: string,
  divisa: string,
  importoCents: number | string,
): Promise<string> {
  const importo = String(importoCents);
  const payload = `codTrans=${codTrans}divisa=${divisa}importo=${importo}${macKey}`;
  return sha1Hex(payload);
}

/** MAC esito: SHA1(codTrans=…esito=…importo=…divisa=…data=…orario=…codAut=… + chiave) */
export async function macPaymentResponse(
  macKey: string,
  fields: {
    codTrans: string;
    esito: string;
    importo: string;
    divisa: string;
    data: string;
    orario: string;
    codAut: string;
  },
): Promise<string> {
  const payload =
    `codTrans=${fields.codTrans}` +
    `esito=${fields.esito}` +
    `importo=${fields.importo}` +
    `divisa=${fields.divisa}` +
    `data=${fields.data}` +
    `orario=${fields.orario}` +
    `codAut=${fields.codAut}` +
    macKey;
  return sha1Hex(payload);
}

export async function verifyPaymentResponseMac(
  macKey: string,
  fields: {
    codTrans: string;
    esito: string;
    importo: string;
    divisa: string;
    data: string;
    orario: string;
    codAut: string;
    mac: string;
  },
): Promise<boolean> {
  const expected = await macPaymentResponse(macKey, fields);
  return expected.toLowerCase() === String(fields.mac ?? '').trim().toLowerCase();
}

const COD_TRANS_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Unique codTrans max 30 chars (XPay).
 * Formato: MP + ggmmaa (Europe/Rome) + random.
 */
export function generateCodTrans(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(new Date());
  const dd = parts.find((p) => p.type === 'day')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'month')?.value ?? '00';
  const yy = parts.find((p) => p.type === 'year')?.value ?? '00';
  const prefix = `MP${dd}${mm}${yy}`;
  const need = Math.max(8, 30 - prefix.length);
  const bytes = new Uint8Array(need);
  crypto.getRandomValues(bytes);
  let out = prefix;
  for (let i = 0; i < need; i++) {
    out += COD_TRANS_ALPHABET[bytes[i]! % COD_TRANS_ALPHABET.length];
  }
  return out.slice(0, 30);
}

export type SimplePayFields = {
  alias: string;
  importo: string;
  divisa: string;
  codTrans: string;
  url: string;
  url_back: string;
  urlpost: string;
  mac: string;
  mail?: string;
  descrizione?: string;
  nome?: string;
  cognome?: string;
  languageId?: string;
};

export async function buildSimplePayFields(params: {
  config: NexiXpayConfig;
  codTrans: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  email?: string | null;
  description?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): Promise<SimplePayFields> {
  const importo = String(Math.max(0, Math.round(params.amountCents)));
  const mac = await macPaymentRequest(
    params.config.macKey,
    params.codTrans,
    NEXI_DIVISA_EUR,
    importo,
  );
  const fields: SimplePayFields = {
    alias: params.config.alias,
    importo,
    divisa: NEXI_DIVISA_EUR,
    codTrans: params.codTrans,
    url: params.returnUrl,
    url_back: params.cancelUrl,
    urlpost: params.notifyUrl,
    mac,
    languageId: 'ITA',
  };
  if (params.email?.trim()) fields.mail = params.email.trim();
  if (params.description?.trim()) {
    fields.descrizione = params.description.trim().slice(0, 200);
  }
  if (params.firstName?.trim()) fields.nome = params.firstName.trim().slice(0, 30);
  if (params.lastName?.trim()) fields.cognome = params.lastName.trim().slice(0, 30);
  return fields;
}

export function edgeFunctionsBaseUrl(): string {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  return `${url}/functions/v1`;
}

/**
 * Pagina HTML pubblica sul dominio School (Supabase forza text/plain su *.supabase.co).
 */
export function nexiPublicPayPageUrl(codTrans: string): string {
  const base = (
    Deno.env.get('NEXI_PAY_PAGE_BASE') ??
    Deno.env.get('SCHOOL_PUBLIC_URL') ??
    Deno.env.get('PUBLIC_WEB_URL') ??
    'https://school.musicproeventi.it'
  ).replace(/\/$/, '');
  const path = (Deno.env.get('NEXI_PAY_PAGE_PATH') ?? '/paga-nexi.html').trim() || '/paga-nexi.html';
  const pathNorm = path.startsWith('/') ? path : `/${path}`;
  return `${base}${pathNorm}?t=${encodeURIComponent(codTrans)}`;
}

export function htmlPaymentResult(
  ok: boolean,
  message: string,
  opts?: { continueHref?: string; continueLabel?: string },
): string {
  const title = ok ? 'Pagamento ricevuto' : 'Pagamento';
  const color = ok ? '#15803d' : '#0f172a';
  const href = opts?.continueHref?.trim() ?? '';
  const label = opts?.continueLabel?.trim() || 'Continua';
  const cta = href
    ? `<p style="margin-top:1.25rem"><a href="${escAttr(href)}" style="display:inline-block;padding:.75rem 1.25rem;border-radius:10px;background:#fbbf24;color:#0f172a;font-weight:700;text-decoration:none">${escHtml(label)}</a></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escHtml(title)}</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#f8fafc;color:#0f172a}
    .card{max-width:28rem;padding:1.5rem;border-radius:12px;background:#fff;box-shadow:0 8px 30px rgba(15,23,42,.08)}
    h1{font-size:1.25rem;margin:0 0 .75rem;color:${color}}
    p{margin:0;line-height:1.5;color:#334155}
  </style>
</head>
<body>
  <div class="card">
    <h1>${escHtml(title)}</h1>
    <p>${escHtml(message)}</p>
    ${cta}
  </div>
</body>
</html>`;
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escHtml(s: string): string {
  return escAttr(s).replace(/'/g, '&#39;');
}

export function formParamsFromRequest(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(body);
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}
