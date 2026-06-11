# GAS Deprecation Guide — MusicPro School

What the legacy **Google Apps Script** stack does today, what replaces it in **Supabase + musicpro/**, and **when to disable** each piece during big-bang cutover.

| Legacy | New |
|--------|-----|
| GAS project (`.clasp.json` scriptId `1RHw6_P38c0EEdH4Y_wxDyWVDbnZBRn88qSwqEXXNhtGlnbQ0dzO7XRnS`) | Supabase MusicProSchool + `musicpro/` monorepo |
| Google Sheets `SPREADSHEET_ID` | PostgreSQL tables (see `supabase/README.md`) |
| GAS Web App `doGet` / `doPost` | Next.js (`musicpro/apps/web`) + Edge Functions / API routes |
| `_LOGIN_TOKENS` magic links | Supabase Auth email + password |
| `StripePagamenti.js` query-token webhook | Stripe signed webhook + `STRIPE_WEBHOOK_SECRET` |

**Parallel run:** not used. Disable GAS **after** new stack smoke tests pass (see `docs/CUTOVER.md`).

---

## 1. Source file map

| GAS file | Purpose |
|----------|---------|
| `Codice.js` | Core admin: members, reimbursements, quotas, reports, Telegram, templates, import |
| `index.html` + related HTML | Admin SPA shell |
| `iscrizioni.js` | Public enrollment API, PDF, email |
| `StripePagamenti.js` | Stripe Payment Links + webhook |
| `login.html`, `area-personale.html` | Magic-link auth + member area |
| `iscrizione.html` | Public form (also on FTP subdomain) |
| `conferma-pagamento.html` | Post-Stripe return page |
| `deploy-iscrizione.js` | FTP deploy: `index.html`, `api.php` → GAS |
| `appsscript.json` | Web app: execute as deployer, anyone anonymous |

---

## 2. Feature mapping — GAS → new stack

### 2.1 Data layer (Sheets → PostgreSQL)

| GAS sheet / constant | PostgreSQL | Migration |
|----------------------|------------|-----------|
| `ASSOCIATI` | `members`, `member_roles`, `tutor_links` | `npm run migrate:sheets` step 1 |
| `IMPOSTAZIONI_QUOTE` | `annual_quota_settings` | step 2 |
| `QUOTE` + legacy cols on ASSOCIATI | `member_annual_quotas` | step 2 |
| `NOTULE` | `reimbursements` | step 3 |
| `ISCRIZIONI` | `enrollments` | step 4 |
| `TEMPLATE` | `message_templates` | step 5 |
| `_LOGIN_TOKENS` | *(removed)* | Supabase Auth |
| `_ISCRIZIONE_TOKENS` | *(removed)* | App-layer signed URLs / Auth |
| GAS constants (Drive IDs, emails) | `app_settings` | seed `003` + manual update |
| *(new)* | `rooms`, `bookings` | seed + new feature |
| *(new)* | `audit_log` | GDPR trail on new writes |
| *(new)* | `message_campaigns`, `message_campaign_recipients` | future bulk comms |

Full column mapping: `supabase/README.md`.

### 2.2 Authentication

| GAS | New stack | Disable GAS when |
|-----|-----------|------------------|
| `processLoginRequest()` → `_LOGIN_TOKENS` sheet → magic link (`?page=area-personale&token=`) | Supabase `signInWithPassword` / signup; `004_auth_hooks.sql` links `auth.users` → `members` | Admin smoke test passes on new URL |
| `login.html`, `area-personale.html` | `musicpro/apps/web` `/login`, `/signup`, `/dashboard` | Same |
| Session in GAS HTMLService | Supabase session cookies (Next middleware) | Same |

**Cutover action:** Email segreteria that login is **email + password**, not magic link.

### 2.3 Admin dashboard (`Codice.js` + `index.html`)

| GAS function / UI area | New stack target | Cutover v1 status |
|------------------------|------------------|-------------------|
| `getAssociati`, CRUD associati | `members` table + admin UI (TBD pages) | Partial — verify critical paths |
| `generateDocument`, NOTULE PDF | Supabase Storage + PDF generator | Post-cutover sprint |
| `getReimbursementDataForDisplay`, delete | `reimbursements` + RLS | Read migrated data; create TBD |
| Quota settings CRUD | `annual_quota_settings` | Migrated; admin UI TBD |
| `saveBulkQuotas`, QUOTE sheet | `member_annual_quotas` | Migrated |
| Reports (`generateYearlyReport`, etc.) | Reporting module TBD | Not required v1 |
| `getTemplates`, `sendBulkMessages` | `message_templates`, campaigns | Templates migrated; send TBD |
| `sendTelegramMessage`, `sincronizzaIDTelegram` | External integration TBD | Disable Telegram sends from GAS after cutover |
| `processImportFile`, import wizard | One-time `migrate:sheets` | Disable after successful migration |
| Drive paths (`getDrivePathSettings`) | `app_settings` + Storage buckets | Reference only for legacy PDFs |
| `onOpen` menu, sheet formatters | N/A | Disable with GAS deploy |

### 2.4 Public enrollment

| GAS | New stack | Disable GAS when |
|-----|-----------|------------------|
| `iscrizione.html` on FTP | Same host; form posts to new API | `api.php` points to new backend + smoke test OK |
| `doPost` enrollment branch in `iscrizioni.js` | Edge Function or `POST /api/enrollment` | Same |
| `generateSignedModule` → Drive PDF | Supabase Storage `enrollments` bucket | When new PDF pipeline live |
| `ensureIscrizioniSheet` writes | `enrollments` inserts via service role | Same |
| `api.php` proxy to `GAS_ISCRIZIONE_URL` (`.env.example`) | Proxy to Supabase/Next API URL | Redeploy via `deploy-iscrizione.js` |

### 2.5 Stripe payments

| GAS (`StripePagamenti.js`) | New stack | Disable GAS when |
|----------------------------|-----------|------------------|
| `STRIPE_MODE` + script properties | Env vars in Vercel / Supabase secrets | Production keys at cutover |
| Payment Link creation | Same Stripe API from server handler | New handler tested in test mode |
| Webhook URL: `?action=stripeWebhookPagamento&token=` | `/functions/v1/stripe-webhook` or `/api/stripe/webhook` + `STRIPE_WEBHOOK_SECRET` | **Stripe Dashboard:** disable GAS endpoint |
| Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded` | Same event subscription on new endpoint | Same |
| Metadata `mp_id_iscrizione` | Preserve in new Payment Links | Required for parity |
| Idempotency via `CacheService` (`stripe_wh_evt_*`, `stripe_pi_fin_*`) | DB unique constraints + idempotency table or event ID cache | Implement before Live |
| `_deferredIscrizioneStripeWork` (email, deactivate link) | Queue / Edge Function background work | Post-payment email must work before GAS off |
| `sincronizzaPagamentoIscrizioneStripe` fallback | Admin “sync payment” action TBD | Optional v1 |
| `STRIPE_RETURN_URL` → `iscrizione.musicproeventi.it` | Keep same static return page | Update only if URL path changes |

**Critical:** Only **one** Live webhook endpoint active. GAS pattern from file header:

```text
POST https://script.google.com/macros/s/DEPLOYMENT_ID/exec?action=stripeWebhookPagamento&token=TOKEN
```

New pattern (from `musicpro/.env.example`):

```text
POST https://<vercel-or-supabase>/.../stripe-webhook
Header: Stripe-Signature (whsec_...)
```

### 2.6 Room booking (sale prova)

| GAS | New stack |
|-----|-----------|
| **Not present in GAS** | `rooms`, `bookings`, `create_booking_safe()`, `/prenotazioni` |

No GAS deprecation step — net-new feature.

### 2.7 Mobile app

| GAS | New stack |
|-----|-----------|
| N/A | Expo app in monorepo (`EXPO_PUBLIC_SUPABASE_*`) |

**Cutover v1:** App Store / Play Store release **not required**. Web cutover is independent.

---

## 3. Disable schedule (big bang)

Use this order during cutover weekend (`docs/CUTOVER_CHECKLIST.md`).

| Order | Component | Action | Reversible? |
|-------|-----------|--------|-------------|
| 1 | New stack | Deploy Supabase + Vercel + iscrizione API | — |
| 2 | Stripe Live | Add **new** webhook; test delivery | Yes |
| 3 | Stripe Live | **Disable** GAS webhook endpoint | Yes — re-enable for rollback |
| 4 | `iscrizione.musicproeventi.it` | FTP deploy `api.php` → new API | Yes — redeploy GAS URL |
| 5 | Admin users | Switch bookmark to Vercel URL | Yes — use GAS URL |
| 6 | GAS web app | **Archive deployment** (Deploy → Manage deployments) | Yes — redeploy if rollback |
| 7 | GAS triggers | Delete time-driven triggers in Apps Script editor | Partial |
| 8 | OAuth / tokens | Revoke unused Cloud Console OAuth clients | No — plan carefully |
| 9 | clasp | Stop `clasp push`; tag repo `gas-archive-YYYY-MM-DD` | N/A |
| 10 | Google Sheet | Set sharing to read-only archive | Yes |

**Do not delete** the Spreadsheet or GAS project until **D+30** stable.

---

## 4. GAS decommission steps (detailed)

### 4.1 Disable web app deploy

1. Open [Apps Script](https://script.google.com) → project from `.clasp.json` scriptId
2. **Deploy → Manage deployments**
3. Archive or deactivate each **Web app** deployment (admin + any `@167+` iscrizione exec URL in `.env.example`)
4. Verify old `/exec` URL returns error or “Script function not found” for `doGet`

### 4.2 Stop Stripe → GAS traffic

1. Stripe Dashboard → Developers → Webhooks (**Live**)
2. Disable endpoint matching `action=stripeWebhookPagamento`
3. Confirm recent events only hit new endpoint

### 4.3 Revoke tokens and access

| Token / access | Where | Action |
|----------------|-------|--------|
| `STRIPE_WEBHOOK_TOKEN` | GAS Script Properties | Obsolete after GAS webhook off; rotate if leaked |
| Google OAuth (web app users) | Cloud Console | Review; revoke if dedicated test client |
| Service account used for `migrate:sheets` | Google Cloud | Keep read-only for archive exports; or revoke after final export |
| FTP `ISCRIZIONE_FTP_*` | Hosting panel | Keep — still used for static iscrizione deploy |
| clasp credentials | `~/.clasprc.json` | Optional revoke; keep local archive |

### 4.4 Archive clasp project

```bash
cd "/Users/mauroandreoni/Cursor/MusicPro School"
git tag gas-archive-$(date +%Y-%m-%d)   # if using git
# Do not clasp push after this point
```

Preserve in repo:

- `Codice.js`, `iscrizioni.js`, `StripePagamenti.js`, HTML files
- `.clasp.json`, `appsscript.json`
- `.env.example` with `GAS_ISCRIZIONE_URL` comment for history

### 4.5 Spreadsheet archive

- Share `SPREADSHEET_ID` spreadsheet as **Viewer** only for admins
- Add sheet `_CUTOVER_YYYY-MM-DD` with note: “Frozen at cutover; live data in Supabase”
- Stop all GAS writes before freeze (disabled deploy achieves this)

---

## 5. What stays on Google (post-deprecation)

| Asset | Reason |
|-------|--------|
| Spreadsheet (read-only) | Legal / historical reference |
| Drive folders (`ROOT_REIMBURSEMENTS_FOLDER_ID`, `ROOT_ISCRIZIONI_FOLDER_ID`) | Historical PDFs not re-imported |
| Google Doc templates | Reference until Supabase Storage templates replace them |
| `musicproeventi@gmail.com` | Still admin contact in `app_settings` |

---

## 6. Rollback — re-enabling GAS

If cutover fails before step 4.1:

1. Stripe: enable GAS webhook; disable new endpoint
2. Run `npm run deploy:iscrizione` with `GAS_ISCRIZIONE_URL` restored in `.env`
3. Redeploy GAS web app if archived
4. Communicate GAS admin URL to staff

Supabase data from failed cutover is **not** auto-synced back to Sheets.

---

## 7. Post-cutover verification (GAS fully off)

- [ ] `curl` GAS `/exec?action=stripeWebhookPagamento` — should not process payments
- [ ] New enrollment does **not** append row to `ISCRIZIONI` sheet
- [ ] Admin tasks no longer require opening Spreadsheet
- [ ] `audit_log` captures new admin actions (when instrumented)
- [ ] No Stripe webhook failures to GAS URL in Dashboard (endpoint removed)

---

## 8. Reference

| Topic | Document |
|-------|----------|
| Cutover steps | `docs/CUTOVER.md` |
| Printable checklist | `docs/CUTOVER_CHECKLIST.md` |
| Sheet → table mapping | `supabase/README.md` |
| Migration CLI | `scripts/migrate-from-sheets/README.md` |
| Booking rules | `musicpro/packages/database/README.md` |
| Iscrizione FTP deploy | `deploy-iscrizione.js`, `.env.example` |
| Stripe GAS webhook | `StripePagamenti.js` (lines 11–14, 411–565) |

---

*Status: pre-cutover — GAS remains production until cutover checklist Phase E is complete.*
