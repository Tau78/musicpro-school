# Accesso associati — diagnosi e backfill Auth

## Pino Solari (n. 407) — 2026-11-18

| Campo | Valore |
|-------|--------|
| Email anagrafica | `solari.pino@gmail.com` |
| Auth Supabase | Presente, collegato (`user_id` ok); `last_sign_in_at` mai |
| Quota 2026 | Pagata |
| Blocco | Modulo incompleto (CF + GDPR/firma assenti) → `/onboarding/form` |

Conflitto email con **Edoardo Solari** (n. 954): email rimossa dalla scheda di Edoardo (resta `manual_tutor_email`).  
**Azione Pino:** [Recupera password](https://school.musicproeventi.it/forgot-password) con `solari.pino@gmail.com`, poi completa CF + privacy.

## Pierpaolo Romairone (n. 22)

| Campo | Valore |
|-------|--------|
| Email anagrafica | `agincourt1965@gmail.com` |
| Auth Supabase | Presente, collegato (`user_id` ok) |
| Creato Auth | 2026-10-01 |

Il backfill **non** era il problema: account già attivo. «Password sempre la stessa» = password **non** coincide con quella in Supabase (es. vecchio portale, oppure mai impostata dopo migrazione).

**Azione:** [Recupera password](https://school.musicproeventi.it/forgot-password) con **esattamente** `agincourt1965@gmail.com`, oppure tab **Link email** sul login.

## Backfill Auth (`npm run backfill:associate-auth`)

Eseguito in produzione il 2026-10-16:

| Esito | N |
|-------|---|
| Già ok | 629 |
| Account Auth creati | 36 |
| Conflitti / email duplicate | 24 |
| Senza email valida in rubrica | 215 |

I 36 creati hanno password casuale: devono usare **Recupera password** o **Link email**.

### Email duplicate in anagrafica (serve email dedicata o fix manuale admin)

- `solari.pino@gmail.com` — EDOARDO SOLARI (+ altro profilo)
- `ameliemayacouture@gmail.com` — conflitto unique
- `terry_ale@yahoo.it`, `francesca.dellerna@gmail.com`, `maricamanfredi70@gmail.com`, `filippo.oliva@gmail.com`, `tabbitaroberto@libero.it`, `n.belloglio@gmail.com`, `minetti.erika@yahoo.it`, `gyore.anett@gmail.com`, `liping977@gmail.com`, `michelasanguineti@libero.it`, `jormez@yahoo.it`, `erica.alberto.eli@gmail.com`, `ainwen14062013@gmail.com`, `cinziapotter@libero.it`, `vdelucchi@asl4.liguria.it`, `saradevoto6@gmail.com`, `rosy41186@gmail.com`, `mauro.cademartori@libero.it`, `aliceter90@gmail.com`

Script singolo: `node scripts/backfill-associate-auth.mjs --email nome@dominio.it`

## Dove si incastrano

1. Password sbagliata / vecchio sistema → messaggio generico; usare recupero.
2. Nessun Auth (prima del backfill) → recupero non inviava mail (fix: ensure Auth in `/api/auth/forgot-password`).
3. Email ≠ anagrafica → login ok ma «Profilo non collegato».
4. Email condivisa tra più soci → solo un profilo collegato.
5. **Tab «Link email» sul login** (pre-2026-11-19) usava `signInWithOtp` = mailer Supabase → link spesso non arrivava. Ora `POST /api/auth/magic-link` (Resend/SMTP come recovery).
6. **Reset password da admin** su `user_id` obsoleto (email Auth ≠ anagrafica) → aggiornava il conto sbagliato; login email teneva la password vecchia. Fix: risoluzione Auth **email-first** + relink in `staff-auth.ts`.

### Pino Solari / Hilary Peruzzo (2026-11-19)

Profili Auth collegati, niente duplicati. Sintomo «password admin non va / magic link assente / poi entra con la vecchia» = punti 5–6 + SMTP locale/Gmail 535. In produzione serve `RESEND_API_KEY` e/o `GOOGLE_SMTP_*` su Vercel.

## Log utili

- Vercel: `[forgot-password]`, `[prepare-login]`
- Supabase Dashboard → Authentication → Logs (failed sign-in)

## Email transazionali e quota Gmail

- **Prenotazioni sale** → Google SMTP (`preferGoogleSmtp: true`), stesso mailbox Workspace.
- **Auth / recupero password / magic link script** → **Resend prima** (se `RESEND_API_KEY` su Vercel), poi fallback Google.
- Limite giornaliero Google: Admin Console → report invii su `mauro@www.musicproeventi.it` / alias notifiche.
- Script segreteria: `npm run send:associate-magic-link -- --email nome@dominio.it --first-name Nome`
