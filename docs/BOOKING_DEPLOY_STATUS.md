# Deploy prenotazioni sale — stato

**Verifica E2E/smoke (2026-08-15): verde sugli check automatizzabili.**  
Rimasto solo un click-through autenticato in UI (serve sessione admin/associato) e il primo pagamento carta live, che Stripe non permette di ritentare via API.

## Completato

| Step | Stato |
|------|--------|
| **Vercel production** | Deploy OK — progetto `musicpro-school` |
| **Dominio** | `https://school.musicproeventi.it` → app Next.js (`/prenotazioni` 200) |
| **Stripe webhook sale (Live)** | **Edge enabled** — `…/functions/v1/stripe-room-webhook` (`we_1TsHPZHG0jb3uD02XQHvibwf`) |
| **Legacy Vercel webhook** | **Disabled** in Stripe Live (`we_1Tr0kTHG0jb3uD02EKcsiEyx`) — 2026-08-15 |
| **Vercel env** | `STRIPE_WEBHOOK_SECRET` in Production (legacy; non più destinatario Stripe sale) |
| **Fix monorepo Vercel** | `scripts/vercel-seed-school-next.mjs` (pattern eventi-app) |
| **Next.js** | Aggiornato a 15.3.6 (CVE + blocco Vercel) |
| **Migrations** | `001`–`019` locali = remote (`supabase migration list --linked`) |
| **Edge Functions** | Tutte ACTIVE: `stripe-room-webhook`, `booking-calendar-sync`, `calendar-availability`, `stripe-credit-shop-webhook`, `external-calendar-sync`, `send-booking-email` |

Script utili:

```bash
# Deploy production
cd "MusicPro School" && npx vercel deploy --prod --yes
npx vercel alias set <deployment-url> school.musicproeventi.it

# Crea webhook Stripe sale (default: Supabase Edge)
node scripts/create-stripe-room-webhook.mjs

# Legacy Vercel /api/stripe/webhook (deprecato — Lambda 500)
node scripts/create-stripe-room-webhook.mjs --vercel
```

## Completato — webhook Supabase Edge (2026-07-12)

| Step | Stato |
|------|--------|
| Edge Function `stripe-room-webhook` | Deploy OK |
| Segreti Edge (`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`) | Impostati |
| Stripe webhook Dashboard | `https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-room-webhook` |
| Migrations 006–009 | Applicate via `supabase db push` |

Endpoint legacy Vercel (`/api/stripe/webhook`) **disabilitato in Stripe Live** il 2026-08-15. Resta in codice come fallback deprecato.

Dettaglio: `docs/STRIPE_ROOM_WEBHOOK.md`

## Storico — migration 006–009

**Stato (2026-07-12):** migration **applicate** (006 enum split + 007 config + 008 admin + 009 Stripe).

**Stato precedente (2026-07-08):** migration non applicate — pooler rifiutava il tenant (progetto INACTIVE).

| Comando | Esito |
|---------|--------|
| `supabase migration list --linked` | Fallito |
| `supabase db push --linked --yes` | Fallito |

Errore (identico su entrambi):

```text
FATAL: (ENOTFOUND) tenant/user postgres.mlsiagbrejjylqvcnfbe not found (SQLSTATE XX000)
host=aws-1-eu-central-1.pooler.supabase.com user=postgres.mlsiagbrejjylqvcnfbe
```

**Interpretazione:** la password DB è stata fornita (connessione al pooler tentata); l’errore indica che il **tenant del progetto non è registrato sul pooler** — tipico se **MusicProSchool** (`mlsiagbrejjylqvcnfbe`) è **Paused**, in restore, o ref/regione non allineati. Non è un fallimento di autenticazione password.

**Automazione / fallback manuale:**

```bash
cd "MusicPro School"
./scripts/apply-booking-migrations.sh   # riprova CLI, altrimenti stampa istruzioni SQL Editor
```

- Bundle unico per incolla: `scripts/sql/booking_migrations_006_008_bundle.sql` (006+007+008 con separatori)
- File singoli: `supabase/migrations/006_booking_config.sql`, `007_booking_admin_review.sql`, `008_stripe_room_booking.sql`

**Cosa fare (Dashboard):**

1. Apri [Supabase Dashboard → MusicProSchool](https://supabase.com/dashboard/project/mlsiagbrejjylqvcnfbe)
2. Verifica che il progetto sia **Active** (non Paused) e attendi eventuale ripresa
3. [SQL Editor → New query](https://supabase.com/dashboard/project/mlsiagbrejjylqvcnfbe/sql/new) → incolla ed esegui il bundle o i tre file in ordine
4. Quando il pooler risponde, riprova:

```bash
SUPABASE_PASS="$(grep -E '^SUPABASE_PASS=' musicpro/.env | head -1 | cut -d= -f2-)"
supabase db push --linked --yes -p "$SUPABASE_PASS"
```

> Nota: `source musicpro/.env` può fallire per path obsoleti in fondo al file; per la CLI usare solo `SUPABASE_PASS` come sopra.

## Verifica post-migration + Edge webhook (2026-08-15)

| # | Check | Esito | Evidenza |
|---|--------|--------|----------|
| 1 | `/prenotazioni` wizard | **Verde** | HTTP 200, chunk `app/prenotazioni/page` in HTML; wizard 3 step (sala/slot/pagamento crediti o Stripe) |
| 2 | `/admin/prenotazioni` approva/rifiuta | **Verde** | HTTP 307 → `/login?redirect=/admin/prenotazioni` (auth-gated); UI `Approva`/`Rifiuta` + RPC `review_booking_safe` |
| 3 | Pagamento → `paid` + `confirmed` | **Verde** | `node scripts/smoke-stripe-room-payment.mjs` — RPC `apply_stripe_room_booking_payment`, idempotenza `duplicate=true`, cleanup OK |
| 4 | `/prenotazioni/mie` | **Verde** | HTTP 200; lista `listMyBookings` + pagamento residuo |
| 5 | Webhook Stripe → Edge, non Vercel | **Verde** | Live Edge **enabled**, Vercel **disabled**; Edge risponde 400 senza firma (viva, non 404) |

### Smoke automatizzati (tutti PASSED)

```bash
node scripts/smoke-phase2.mjs
node scripts/smoke-credit-shop.mjs
node scripts/smoke-calendar-booking.mjs
node scripts/smoke-stripe-room-payment.mjs
```

| Script | Esito |
|--------|--------|
| Fase 2 (penali, PROVI, RPC admin/cancel/credits) | PASSED |
| SHOP crediti (pacchetti + saldo + RPC + debit→confirm) | PASSED — `pending/unpaid` → `confirmed/not_required` |
| Google Calendar (migration 010, availability, sync) | PASSED — sync su booking confirmed esistente |
| Stripe room payment RPC | PASSED — `pending/unpaid` → `confirmed/paid` |

### HTTP produzione (anon)

| URL | HTTP |
|-----|------|
| `/prenotazioni`, `/prenotazioni/mie`, `/login`, `/signup` | 200 |
| `/dashboard`, `/dashboard/shop`, `/admin`, `/admin/prenotazioni`, `/admin/sale`, `/admin/shop`, `/admin/penali`, `/admin/impostazioni` | 307 → login |
| `/api/prenotazioni/availability` (senza params) | 400 (validazione, non 500) |
| `/api/stripe/webhook` POST senza firma | 400 |
| Edge `stripe-room-webhook` / `stripe-credit-shop-webhook` POST `{}` | 400 (manca `Stripe-Signature`) |
| Edge `calendar-availability`, `booking-calendar-sync`, `send-booking-email`, `external-calendar-sync` POST `{}` | 401 |

### Fix follow-up audit (2026-08-15)

- `debit_booking_credits` non confermava lo slot (`pending`/`unpaid` dopo “Paga con crediti”). **Sistemato** in migration `019` + wizard che usa lo status post-addebito.
- Il report infra “Edge webhook disabled / Vercel enabled” è **stale**: in Live Edge è enabled e Vercel è disabled.

### Residuo (non bloccante, non automatizzabile da qui)

- **Click-through UI** con sessione reale: login associato → wizard → “Le mie”; login admin → Approva. Nessuna credenziale di test in repo.
- **Prima delivery Stripe Live** di un evento `mp_flow=room_booking`: Stripe API rifiuta `events/:id/retry` in live. Il routing è già corretto; il log Dashboard 200 arriverà al primo pagamento carta sala.
- Webhook GAS / ScuolaSemplice / WooCommerce restano **enabled** in Stripe Live: sono iscrizione/sito, **fuori scope** prenotazioni sale.
- Nessun endpoint Stripe dedicato per `stripe-credit-shop-webhook` (SHOP crediti). Lo smoke schema/RPC è verde; il webhook shop va registrato prima del go-live pacchetti a pagamento.
- Email conferma: segreti Edge Resend assenti (`RESEND_API_KEY`, `BOOKING_EMAIL_FROM`). Calendar sync è verde.
