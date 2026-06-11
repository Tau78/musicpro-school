# MusicPro School — Cutover Checklist

Print this page. Check boxes only when verified by a human.

**Cutover date:** _______________  
**Cutover lead:** _______________  
**Rollback deadline (GAS still available):** _______________

---

## Week −2 to −1 — Pre-cutover validation

### Supabase MusicProSchool

- [ ] Supabase project **MusicProSchool** created (separate from MusicProEventi)
- [ ] Migration `001_initial_schema.sql` applied
- [ ] Migration `002_rls_policies.sql` applied
- [ ] Migration `003_seed_data.sql` applied
- [ ] Migration `004_auth_hooks.sql` applied
- [ ] Migration `005_booking_functions.sql` applied
- [ ] Seed: 4 `rooms` rows present
- [ ] Seed: `annual_quota_settings` present
- [ ] Seed: `app_settings` keys present
- [ ] Storage buckets `reimbursements` and `enrollments` created
- [ ] Realtime enabled on `bookings`
- [ ] Auth Site URL + Redirect URLs configured
- [ ] Email provider configured (SMTP or Supabase)

### Environment variables

- [ ] Root `.env`: `GOOGLE_SERVICE_ACCOUNT_JSON` set
- [ ] Root `.env`: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set
- [ ] Root `.env`: FTP credentials for iscrizione subdomain
- [ ] Root `.env`: Stripe test keys validated
- [ ] `musicpro/.env`: `NEXT_PUBLIC_SUPABASE_*` set
- [ ] `musicpro/.env`: `SUPABASE_SERVICE_ROLE_KEY` set (server only)
- [ ] `musicpro/.env`: `STRIPE_WEBHOOK_SECRET` from test endpoint
- [ ] Vercel Production env vars match `musicpro/.env`

### Data migration

- [ ] `npm install` at project root succeeds
- [ ] `npm run migrate:sheets -- --dry-run` completes exit 0
- [ ] Dry-run member count recorded: ________
- [ ] Dry-run reimbursement count recorded: ________
- [ ] Dry-run enrollment count recorded: ________
- [ ] Dry-run quota rows recorded: ________
- [ ] Dry-run template count recorded: ________
- [ ] Staging live migration `npm run migrate:sheets` exit 0
- [ ] SQL count reconciliation matches dry-run (± documented skips)
- [ ] No unresolved duplicate `tax_code` in members
- [ ] `member_roles` assigned for admin / segreteria / docente test users

### Auth test (staging)

- [ ] Admin test user: signup/login works
- [ ] Admin: `members.user_id` linked after login
- [ ] Docente test user: login works
- [ ] Associato test user: login works
- [ ] Unknown email: clear error message (no silent failure)
- [ ] Password reset tested (if enabled)

### Booking test (staging)

- [ ] Associato with quota: booking succeeds
- [ ] Duplicate slot: `SLOT_TAKEN` error shown
- [ ] Associato without quota: `QUOTA_NOT_PAID` error shown
- [ ] Realtime: second client sees slot update

### Stripe test mode

- [ ] New webhook endpoint deployed (Edge Function **or** `/api/stripe/webhook`)
- [ ] Events subscribed: `checkout.session.completed`
- [ ] Events subscribed: `checkout.session.async_payment_succeeded`
- [ ] Events subscribed: `payment_intent.succeeded`
- [ ] Stripe CLI / Dashboard test event returns 200
- [ ] Test payment updates `enrollments` payment fields
- [ ] Idempotency: duplicate event does not double-update
- [ ] `metadata.mp_id_iscrizione` path verified

### Staging rehearsal

- [ ] Full cutover dry run on staging completed
- [ ] Segreteria notified of maintenance window
- [ ] Rollback steps reviewed (`docs/CUTOVER.md` §5)
- [ ] GAS web app URL bookmarked for rollback

---

## Friday before cutover

- [ ] Maintenance banner on `iscrizione.html` prepared (optional)
- [ ] DNS TTL lowered for iscrizione host if applicable (optional)
- [ ] Stripe Live keys ready but not switched until cutover hour
- [ ] Team knows: **no parallel run** — big bang only

---

## Cutover day — Phase A: Database (08:00–10:00)

- [ ] Maintenance announcement sent
- [ ] Optional: GAS spreadsheet revision noted for archive
- [ ] Production migrations 001–005 confirmed applied
- [ ] `npm run migrate:sheets` on **production** — exit 0
- [ ] Production SQL counts match expected
- [ ] Spot-check: 5 members OK
- [ ] Spot-check: 5 reimbursements OK
- [ ] Spot-check: 5 enrollments OK
- [ ] Production `member_roles` verified for staff

**If any fail → STOP → rollback planning**

---

## Cutover day — Phase B: Deploy (10:00–12:00)

- [ ] Vercel production deploy succeeded
- [ ] Custom admin domain DNS + HTTPS OK
- [ ] Supabase Edge Functions deployed (if used)
- [ ] New enrollment API URL known: ________________________________
- [ ] `deploy-iscrizione.js` / `api.php` points to **new** API (not GAS)
- [ ] `npm run deploy:iscrizione` succeeded
- [ ] `https://iscrizione.musicproeventi.it/` loads form
- [ ] `STRIPE_RETURN_URL` correct

---

## Cutover day — Phase C: Stripe webhook (12:00–13:00)

- [ ] New Live webhook endpoint added in Stripe Dashboard
- [ ] `STRIPE_WEBHOOK_SECRET` updated in Vercel + Supabase secrets
- [ ] Test Live webhook delivery → 200 OK
- [ ] GAS webhook endpoint **disabled or removed** in Stripe Live
- [ ] `STRIPE_MODE=live` in production envs
- [ ] Live Stripe secret/publishable keys in production envs
- [ ] No duplicate webhook processing confirmed

---

## Cutover day — Phase D: Traffic (13:00–14:00)

- [ ] Admin users directed to new URL: ________________________________
- [ ] Old GAS admin URL documented for rollback only
- [ ] Iscrizione subdomain serves new stack end-to-end

---

## Cutover day — Phase E: Smoke tests (14:00–16:00)

- [ ] Admin login → dashboard
- [ ] Member list loads (count plausible)
- [ ] Reimbursement list loads
- [ ] Book + cancel test slot on `/prenotazioni`
- [ ] Submit test enrollment form
- [ ] Complete Stripe payment → enrollment marked paid
- [ ] Return / conferma pagamento page loads
- [ ] No critical errors in Supabase / Vercel logs

**All green? → Proceed to post-cutover. Any red? → Consider rollback (§5 in CUTOVER.md).**

---

## Monday+ — GAS decommission (only if smoke tests green)

- [ ] GAS web app deployment disabled/archived
- [ ] GAS Stripe webhook remains off
- [ ] OAuth tokens / unused service accounts revoked
- [ ] clasp project archived locally (`.clasp.json` script preserved in git)
- [ ] Google Sheet set read-only (not deleted)
- [ ] `docs/GAS_DEPRECATION.md` status updated

---

## Post-cutover — First week

### D+0

- [ ] Stripe webhook delivery: 0 failures (24 h)
- [ ] Pending enrollments reviewed
- [ ] `audit_log` sampled — no anomalies

### D+1

- [ ] Segreteria trained on new admin UI

### D+2

- [ ] Sample 10 associato logins OK
- [ ] Orphan `members.user_id` fixes applied

### D+3

- [ ] Room booking errors reviewed

### D+4

- [ ] New enrollment volume sanity check

### D+5

- [ ] GAS triggers removed (if any remain)

### D+7

- [ ] Cutover retrospective complete
- [ ] Known v1 gaps ticketed

---

## Rollback (emergency only)

- [ ] Rollback decision time: _______________
- [ ] GAS Stripe webhook re-enabled
- [ ] New Stripe webhook disabled
- [ ] `api.php` redeployed with `GAS_ISCRIZIONE_URL`
- [ ] Admin users notified to use GAS URL
- [ ] Incident notes written before retry

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Cutover lead | | | |
| Segreteria rep | | | |

---

*Companion doc: `docs/CUTOVER.md`*
