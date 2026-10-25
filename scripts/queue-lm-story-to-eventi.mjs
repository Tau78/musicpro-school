#!/usr/bin/env node
/**
 * Ponte sottile School → publisher storie di APP Eventi.
 *
 * School NON ha Meta Graph. Eventi SÌ (`admin-social-story-publish-cron`).
 * Questo script mette in coda un PNG/JPG last-minute sul bucket Eventi
 * `social-story-media` e inserisce piano+slot su @musicproeventi.
 * Il cron Eventi pubblica. Non chiamare Meta da School.
 *
 * NON usare Edge `admin-social-story-manual-package`: ignora accountId
 * nel body e cade sull’account DEFAULT (@ilcervellonegenova).
 *
 * Default: --dry-run (niente write). --apply solo se esplicito.
 *
 *   node scripts/queue-lm-story-to-eventi.mjs \
 *     --file docs/assets/school/storie-last-minute/LM-….png \
 *     --account musicproeventi \
 *     --scheduled-at 2026-10-26T19:30:00 \
 *     --link https://school.musicproeventi.it/prenotazioni
 *
 *   node scripts/queue-lm-story-to-eventi.mjs … --apply
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHOOL_ROOT = join(__dirname, '..');

const DEFAULT_ACCOUNT = 'musicproeventi';
const DEFAULT_LINK = 'https://school.musicproeventi.it/prenotazioni';
const DEFAULT_EVENTI_REPO = '/Users/mauroandreoni/APP Eventi da GAS';
const BUCKET = 'social-story-media';
const MARKER_KIND = 'school-last-minute';
const ALLOWED_ACCOUNTS = new Set([DEFAULT_ACCOUNT]);
const BLOCKED_ACCOUNTS = new Set(['ilcervellonegenova', 'ilcervellonelaspezia']);
/** Slot da sostituire nello stesso giorno Roma (mai published). */
const SLOT_REPLACE_STATUSES = ['pending', 'failed', 'partial'];
/** Se dopo cancel non restano slot «vivi», il piano va in cancelled. */
const PLAN_LIVE_SLOT_STATUSES = ['pending', 'processing', 'failed', 'partial'];

const USAGE = `Ponte School → publisher storie Eventi (account @${DEFAULT_ACCOUNT}).

Default: --dry-run (stampa piano, niente write, niente Meta).

  node scripts/queue-lm-story-to-eventi.mjs \\
    --file docs/assets/school/storie-last-minute/LM-YYYY-MM-DD-Sala-HH-HH-phase.png \\
    --account ${DEFAULT_ACCOUNT} \\
    --scheduled-at 2026-10-26T19:30:00 \\
    [--caption "…"] \\
    [--link ${DEFAULT_LINK}]

  node scripts/queue-lm-story-to-eventi.mjs … --apply

--scheduled-at: ISO. Senza timezone = Europe/Rome.
--apply: upload bucket Eventi + insert piano/slot. Serve OK Mauro + secret Eventi.
--replace-pending-day: prima dell’insert, annulla slot school-last-minute pending/failed/partial
  dello stesso giorno calendario Roma su @musicproeventi (default ON con --apply e in dry-run).
--no-replace-pending-day: non annullare; rischio doppia storia lo stesso giorno.
Prima release / compose --draft: NON usare --apply.

Vietato: @ilcervellonegenova, Edge admin-social-story-manual-package, Meta da School.
Credenziali: EVENTI_SUPABASE_URL + EVENTI_SUPABASE_SERVICE_ROLE_KEY
  oppure .env headless di APP Eventi. Non stampa secret. Exit 2 se --apply senza creds.`;

function printUsageAndExit(code = 0) {
  console.log(USAGE);
  process.exit(code);
}

function normalizeAccount(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function isBlockedAccount(slug) {
  const s = normalizeAccount(slug);
  return BLOCKED_ACCOUNTS.has(s) || s.includes('cervellone');
}

function parseArgs(argv) {
  const out = {
    help: false,
    apply: false,
    dryRun: true,
    file: '',
    account: DEFAULT_ACCOUNT,
    scheduledAt: '',
    caption: '',
    link: DEFAULT_LINK,
    replacePendingDay: true,
    noReplacePendingDay: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v == null || v.startsWith('--')) {
        console.error(`Manca il valore per ${a}`);
        process.exit(1);
      }
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--file') out.file = next();
    else if (a === '--account') out.account = next();
    else if (a === '--scheduled-at') out.scheduledAt = next();
    else if (a === '--caption') out.caption = next();
    else if (a === '--link') out.link = next();
    else if (a === '--replace-pending-day') out.replacePendingDay = true;
    else if (a === '--no-replace-pending-day') out.noReplacePendingDay = true;
    else {
      console.error(`Flag sconosciuto: ${a}`);
      printUsageAndExit(1);
    }
  }
  if (out.apply && argv.includes('--dry-run')) {
    console.error('Non combinare --apply e --dry-run.');
    process.exit(1);
  }
  if (out.apply) out.dryRun = false;
  out.replacePendingDay = !out.noReplacePendingDay;
  return out;
}

function parseEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function loadEventiOnlyKeysFromSchool() {
  const out = {};
  for (const rel of ['.env', 'musicpro/.env']) {
    const parsed = parseEnvFile(join(SCHOOL_ROOT, rel));
    for (const [k, v] of Object.entries(parsed)) {
      if (k.startsWith('EVENTI_') && out[k] === undefined) out[k] = v;
    }
  }
  return out;
}

function resolveEventiCreds() {
  const schoolEventi = loadEventiOnlyKeysFromSchool();
  const processUrl = process.env.EVENTI_SUPABASE_URL || schoolEventi.EVENTI_SUPABASE_URL || '';
  const processKey =
    process.env.EVENTI_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EVENTI_SUPABASE_SERVICE_ROLE ||
    schoolEventi.EVENTI_SUPABASE_SERVICE_ROLE_KEY ||
    schoolEventi.EVENTI_SUPABASE_SERVICE_ROLE ||
    '';

  const eventiRepo = process.env.EVENTI_REPO || DEFAULT_EVENTI_REPO;
  const fileEnv = {};
  const filePaths = [
    join(eventiRepo, 'musicpro-eventi-app/apps/headless/.env'),
    join(eventiRepo, '.env.local'),
    join(eventiRepo, 'supabase/.env'),
    join(eventiRepo, 'musicpro-eventi-app/.env'),
  ];
  const foundFiles = [];
  for (const p of filePaths) {
    if (!existsSync(p)) continue;
    foundFiles.push(p);
    Object.assign(fileEnv, parseEnvFile(p));
  }

  const url = (
    processUrl ||
    fileEnv.EVENTI_SUPABASE_URL ||
    fileEnv.HEADLESS_SUPABASE_URL ||
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    ''
  ).replace(/\/$/, '');
  const key =
    processKey ||
    fileEnv.EVENTI_SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.EVENTI_SUPABASE_SERVICE_ROLE ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    '';

  let source = 'assenti';
  if (processUrl && processKey) source = 'EVENTI_* (process/School .env)';
  else if (url && key) source = `APP Eventi .env (${foundFiles.length} file)`;

  return { url, key, source, eventiRepo, foundFiles };
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function assertHttpsLink(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`--link non è un URL: ${url}`);
    process.exit(1);
  }
  if (parsed.protocol !== 'https:') {
    console.error('--link deve essere HTTPS (landing School, non Eventi app).');
    process.exit(1);
  }
  return parsed.toString();
}

function parseScheduledAt(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(text)) {
    const d = new Date(text);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }
  const m = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) {
    const d = new Date(text);
    if (!Number.isFinite(d.getTime())) return null;
    return d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6] ?? 0);
  return romeLocalToUtc(y, mo, d, hh, mm, ss);
}

function romeLocalToUtc(y, m, d, hh, mm, ss = 0) {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(guess)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

function stickerConfigHasKind(stickerConfig, kind) {
  return (
    Array.isArray(stickerConfig) &&
    stickerConfig.some((row) => String(row?.kind ?? '') === kind)
  );
}

function romeCalendarYmd(date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

/** [start, endExclusive) UTC per il giorno calendario Europe/Rome di `date`. */
function romeDayUtcRange(date) {
  const { y, m, d } = romeCalendarYmd(date);
  const start = romeLocalToUtc(y, m, d, 0, 0, 0);
  const cal = new Date(Date.UTC(y, m - 1, d));
  cal.setUTCDate(cal.getUTCDate() + 1);
  const endExclusive = romeLocalToUtc(
    cal.getUTCFullYear(),
    cal.getUTCMonth() + 1,
    cal.getUTCDate(),
    0,
    0,
    0,
  );
  const label = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start, endExclusive, label };
}

function romeLabel(date) {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return null;
}

function safeStorageName(filePath) {
  const base = basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
  return base || 'lm-story.png';
}

function missingCredsMessage() {
  return [
    'Mancano credenziali Eventi (niente write).',
    'Imposta EVENTI_SUPABASE_URL + EVENTI_SUPABASE_SERVICE_ROLE_KEY,',
    'oppure il .env headless di APP Eventi (musicpro-eventi-app/apps/headless/.env).',
    'Non usare le credenziali School. Non stampo i secret.',
  ].join(' ');
}

function printPlan(plan) {
  console.log('');
  console.log('=== Ponte School → Eventi (storie last-minute) ===');
  console.log(`modo            ${plan.mode}`);
  console.log(`account         @${plan.account}`);
  console.log(`file            ${plan.file}`);
  console.log(`bytes           ${plan.bytes ?? '—'}`);
  console.log(`mime            ${plan.mime ?? '—'}`);
  console.log(`scheduledAt     ${plan.scheduledAtRome} (Europe/Rome)`);
  console.log(`scheduledAt UTC ${plan.scheduledAtUtc}`);
  console.log(`caption         ${plan.caption ? JSON.stringify(plan.caption) : '(vuota)'}`);
  console.log(`link sticker    ${plan.link}`);
  console.log(`bucket          ${BUCKET}`);
  console.log(`storage path    ${plan.storagePath}`);
  console.log(`Eventi host     ${plan.eventiHost || '—'}`);
  console.log(`creds source    ${plan.credsSource}`);
  console.log(
    `replace day     ${plan.replacePendingDay ? 'sì (annulla pending/failed/partial school-LM stesso giorno Roma)' : 'no (--no-replace-pending-day)'}`,
  );
  if (plan.accountRow) {
    console.log(
      `account row     id=${plan.accountRow.id} slug=${plan.accountRow.slug} ig=@${plan.accountRow.ig_username} default=${plan.accountRow.is_default} active=${plan.accountRow.is_active}`,
    );
  } else {
    console.log('account row     (non risolto in dry-run senza write)');
  }
  console.log('publisher       cron Eventi admin-social-story-publish-cron');
  console.log('NON usato       Edge admin-social-story-manual-package (cade sul DEFAULT Cervellone)');
  console.log('Meta da School  no');
  console.log('');
}

async function resolveMusicproAccount(supabase, wanted) {
  const slug = normalizeAccount(wanted);
  const { data, error } = await supabase
    .from('social_instagram_accounts')
    .select('id, slug, ig_username, is_active, is_default')
    .or(`slug.eq.${slug},ig_username.eq.${slug}`)
    .limit(5);
  if (error) {
    return { error: error.message };
  }
  const rows = data ?? [];
  const exact =
    rows.find((r) => normalizeAccount(r.slug) === slug) ||
    rows.find((r) => normalizeAccount(r.ig_username) === slug);
  if (!exact) {
    return { error: `Account @${slug} non trovato in social_instagram_accounts.` };
  }
  return { row: exact };
}

function guardResolvedAccount(row, wanted) {
  const slug = normalizeAccount(row.slug);
  const ig = normalizeAccount(row.ig_username);
  const wantedNorm = normalizeAccount(wanted);
  if (isBlockedAccount(slug) || isBlockedAccount(ig)) {
    return `STOP: account risolto @${slug} è bloccato (niente Cervellone).`;
  }
  if (slug !== wantedNorm && ig !== wantedNorm) {
    return `STOP: account risolto @${slug} ≠ @${wantedNorm}.`;
  }
  if (!ALLOWED_ACCOUNTS.has(slug) && !ALLOWED_ACCOUNTS.has(ig)) {
    return `STOP: solo @${DEFAULT_ACCOUNT} è ammesso per School (risolto @${slug}).`;
  }
  if (row.is_default === true && slug !== DEFAULT_ACCOUNT) {
    return `STOP: is_default=true su @${slug} — rifiuto per non pubblicare sul profilo sbagliato.`;
  }
  if (row.is_active === false) {
    return `STOP: @${slug} non è attivo.`;
  }
  return null;
}

async function findSchoolLmSlotsForRomeDay(supabase, accountId, scheduledDate) {
  const { start, endExclusive, label } = romeDayUtcRange(scheduledDate);
  const { data: plans, error: planErr } = await supabase
    .from('social_story_plans')
    .select('id, sticker_config, status')
    .eq('instagram_account_id', accountId)
    .eq('status', 'active');
  if (planErr) return { error: planErr.message };
  const lmPlanIds = (plans ?? [])
    .filter((p) => stickerConfigHasKind(p.sticker_config, MARKER_KIND))
    .map((p) => p.id);
  if (lmPlanIds.length === 0) {
    return { slots: [], affectedPlanIds: [], dayLabel: label, start, endExclusive };
  }
  const { data: slots, error: slotErr } = await supabase
    .from('social_story_slots')
    .select('id, plan_id, scheduled_at, status, meta_publish_status, tiktok_publish_status')
    .in('plan_id', lmPlanIds)
    .in('status', SLOT_REPLACE_STATUSES)
    .gte('scheduled_at', start.toISOString())
    .lt('scheduled_at', endExclusive.toISOString())
    .order('scheduled_at', { ascending: true });
  if (slotErr) return { error: slotErr.message };
  const rows = slots ?? [];
  const affectedPlanIds = [...new Set(rows.map((s) => s.plan_id))];
  return { slots: rows, affectedPlanIds, dayLabel: label, start, endExclusive };
}

async function replacePendingSchoolLmForRomeDay(supabase, plan, { dryRun }) {
  const scheduled = new Date(plan.scheduledAtUtc);
  const found = await findSchoolLmSlotsForRomeDay(supabase, plan.accountRow.id, scheduled);
  if (found.error) {
    console.error(`replace-pending-day: lookup fallito: ${found.error}`);
    process.exit(1);
  }
  const { slots, affectedPlanIds, dayLabel, start, endExclusive } = found;
  console.log('');
  console.log(
    `--- replace-pending-day (Rome ${dayLabel}) @${plan.account} kind=${MARKER_KIND} ---`,
  );
  console.log(
    `    finestra UTC  [${start.toISOString()}, ${endExclusive.toISOString()})`,
  );
  if (slots.length === 0) {
    console.log('    nessuno slot pending/failed/partial da annullare (published intatti).');
    console.log('');
    return;
  }
  for (const s of slots) {
    console.log(
      `    ${dryRun ? 'would cancel' : 'cancel'}  slot=${s.id}  plan=${s.plan_id}  status=${s.status}  scheduled=${romeLabel(new Date(s.scheduled_at))}`,
    );
  }
  if (dryRun) {
    console.log(`    dry-run: ${slots.length} slot · ${affectedPlanIds.length} piano/i (nessun write).`);
    console.log('');
    return;
  }
  const ts = new Date().toISOString();
  const slotIds = slots.map((s) => s.id);
  const { error: slotUpdErr } = await supabase
    .from('social_story_slots')
    .update({
      status: 'cancelled',
      meta_publish_status: 'skipped',
      tiktok_publish_status: 'skipped',
      updated_at: ts,
    })
    .in('id', slotIds);
  if (slotUpdErr) {
    console.error(`replace-pending-day: cancel slot fallito: ${slotUpdErr.message}`);
    process.exit(1);
  }
  for (const planId of affectedPlanIds) {
    const { data: remaining, error: remErr } = await supabase
      .from('social_story_slots')
      .select('id')
      .eq('plan_id', planId)
      .in('status', PLAN_LIVE_SLOT_STATUSES)
      .limit(1);
    if (remErr) {
      console.error(`replace-pending-day: check residui piano ${planId}: ${remErr.message}`);
      process.exit(1);
    }
    if (remaining?.length) continue;
    const { error: planUpdErr } = await supabase
      .from('social_story_plans')
      .update({ status: 'cancelled', updated_at: ts })
      .eq('id', planId);
    if (planUpdErr) {
      console.error(`replace-pending-day: cancel piano ${planId}: ${planUpdErr.message}`);
      process.exit(1);
    }
    console.log(`    piano ${planId} → cancelled (nessuno slot pending/processing/failed/partial).`);
  }
  console.log(`    ok: ${slotIds.length} slot annullati.`);
  console.log('');
}

async function applyQueue(supabase, plan, filePath) {
  const bytes = readFileSync(filePath);
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(plan.storagePath, bytes, {
    contentType: plan.mime,
    upsert: true,
  });
  if (upErr) {
    console.error(`Upload bucket fallito: ${upErr.message}`);
    process.exit(1);
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(plan.storagePath);
  const imageUrl = pub?.publicUrl;
  if (!imageUrl) {
    console.error('getPublicUrl vuoto dopo upload.');
    process.exit(1);
  }
  const head = await fetch(imageUrl, { method: 'HEAD' });
  if (!head.ok) {
    console.error(`URL pubblico non raggiungibile (${head.status}).`);
    process.exit(1);
  }

  const stickerConfig = [
    { kind: MARKER_KIND },
    { kind: 'link', url: plan.link, x: 0.5, y: 0.88 },
  ];
  const { data: inserted, error: planErr } = await supabase
    .from('social_story_plans')
    .insert({
      image_url: imageUrl,
      media_type: 'image',
      caption: plan.caption || null,
      mention_handles: '',
      sticker_config: stickerConfig,
      instagram_account_id: plan.accountRow.id,
      tiktok_enabled: false,
      tiktok_post_options: {},
      created_by: null,
      repeat_enabled: false,
      repeat_interval: 1,
      randomize_hours: 0,
      randomize_minutes: 0,
      planning_weeks: 1,
      status: 'active',
    })
    .select('id')
    .single();
  if (planErr || !inserted?.id) {
    console.error(`Insert piano fallito: ${planErr?.message || 'id mancante'}`);
    process.exit(1);
  }
  const { data: slot, error: slotErr } = await supabase
    .from('social_story_slots')
    .insert({
      plan_id: inserted.id,
      scheduled_at: plan.scheduledAtUtc,
      base_scheduled_at: plan.scheduledAtUtc,
      status: 'pending',
      meta_publish_status: 'pending',
      tiktok_publish_status: 'skipped',
    })
    .select('id')
    .single();
  if (slotErr) {
    await supabase.from('social_story_plans').delete().eq('id', inserted.id);
    console.error(`Insert slot fallito (piano rollback): ${slotErr.message}`);
    process.exit(1);
  }
  console.log(`coda OK  piano ${inserted.id}  slot ${slot?.id ?? '—'}  @${plan.account}`);
  console.log(`image    ${imageUrl}`);
  console.log('Il cron Eventi pubblica a scheduledAt. School non chiama Meta.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsageAndExit(0);

  const account = normalizeAccount(args.account || DEFAULT_ACCOUNT);
  if (!account) {
    console.error('Serve --account (default musicproeventi).');
    process.exit(1);
  }
  if (isBlockedAccount(account) || !ALLOWED_ACCOUNTS.has(account)) {
    console.error(
      `STOP: account @${account} non ammesso. School pubblica solo su @${DEFAULT_ACCOUNT}, mai su @ilcervellonegenova.`,
    );
    process.exit(1);
  }

  if (!args.file) {
    console.error('Serve --file (PNG/JPG 9:16).');
    printUsageAndExit(1);
  }
  if (!args.scheduledAt) {
    console.error('Serve --scheduled-at (ISO, senza timezone = Europe/Rome).');
    printUsageAndExit(1);
  }

  const filePath = isAbsolute(args.file)
    ? args.file
    : resolve(process.cwd(), args.file);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    console.error(`File non trovato: ${filePath}`);
    process.exit(1);
  }
  const mime = contentTypeFor(filePath);
  if (!mime) {
    console.error('Il file deve essere .png / .jpg / .jpeg.');
    process.exit(1);
  }
  const scheduled = parseScheduledAt(args.scheduledAt);
  if (!scheduled) {
    console.error(`--scheduled-at non valido: ${args.scheduledAt}`);
    process.exit(1);
  }
  const link = assertHttpsLink(args.link || DEFAULT_LINK);
  if (!link) {
    console.error('Serve --link HTTPS.');
    process.exit(1);
  }
  if (/eventi\.musicproeventi\.it/i.test(link) || /musicproeventiapp\.html/i.test(link)) {
    console.error(
      'STOP: link sticker deve essere la landing prenotazioni School, non Eventi app.',
    );
    process.exit(1);
  }

  const creds = resolveEventiCreds();
  const storagePath = `images/${account}/${safeStorageName(filePath)}`;
  const plan = {
    mode: args.apply ? 'APPLY (upload + insert Eventi; Meta lo fa il cron)' : 'DRY-RUN (niente write)',
    account,
    file: filePath,
    bytes: statSync(filePath).size,
    mime,
    scheduledAtRome: romeLabel(scheduled),
    scheduledAtUtc: scheduled.toISOString(),
    caption: String(args.caption ?? '').trim(),
    link,
    storagePath,
    eventiHost: hostOf(creds.url),
    credsSource: creds.source,
    accountRow: null,
    replacePendingDay: args.replacePendingDay,
  };

  if (!args.apply) {
    if (!creds.url || !creds.key) {
      printPlan(plan);
      console.log('Dry-run: niente upload, niente insert, niente Meta.');
      console.log(`Credenziali Eventi assenti — ok in dry-run. --apply → exit 2. ${missingCredsMessage()}`);
      return;
    }
    const supabase = createClient(creds.url, creds.key, { auth: { persistSession: false } });
    const resolved = await resolveMusicproAccount(supabase, account);
    if (resolved.error) {
      printPlan(plan);
      console.error(`Lookup account (read-only): ${resolved.error}`);
      process.exit(1);
    }
    const guard = guardResolvedAccount(resolved.row, account);
    if (guard) {
      printPlan(plan);
      console.error(guard);
      process.exit(1);
    }
    plan.accountRow = resolved.row;
    printPlan(plan);
    if (plan.replacePendingDay) {
      await replacePendingSchoolLmForRomeDay(supabase, plan, { dryRun: true });
    }
    console.log('Dry-run: niente upload, niente insert, niente Meta.');
    console.log('Lookup Eventi ok (solo lettura). Per accodare: stesso comando + --apply.');
    return;
  }

  if (!creds.url || !creds.key) {
    printPlan(plan);
    console.error(missingCredsMessage());
    process.exit(2);
  }

  const supabase = createClient(creds.url, creds.key, { auth: { persistSession: false } });
  const resolved = await resolveMusicproAccount(supabase, account);
  if (resolved.error) {
    printPlan(plan);
    console.error(resolved.error);
    process.exit(1);
  }
  const guard = guardResolvedAccount(resolved.row, account);
  if (guard) {
    printPlan(plan);
    console.error(guard);
    process.exit(1);
  }
  plan.accountRow = resolved.row;
  printPlan(plan);
  if (plan.replacePendingDay) {
    await replacePendingSchoolLmForRomeDay(supabase, plan, { dryRun: false });
  }
  await applyQueue(supabase, plan, filePath);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
