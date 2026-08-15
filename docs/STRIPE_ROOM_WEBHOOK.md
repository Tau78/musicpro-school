# Webhook Stripe — prenotazioni sale (Supabase Edge)

Endpoint HTTP nativo con verifica firma `Stripe-Signature`. Sostituisce il webhook Next.js su Vercel (`/api/stripe/webhook`) che fallisce in runtime monorepo.

## Componenti

| Pezzo | Percorso |
| :--- | :--- |
| Edge Function | `supabase/functions/stripe-room-webhook/` |
| Shared helpers | `supabase/functions/_shared/stripe-webhook.ts` |
| RPC DB | `public.apply_stripe_room_booking_payment` |
| Idempotenza | `public.stripe_room_booking_payment_receipts` |

Migration: `supabase/migrations/008_stripe_room_booking.sql`

## URL endpoint (produzione)

Dopo deploy:

```text
https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-room-webhook
```

In Stripe Dashboard → Webhooks → **Aggiungi endpoint** (o aggiorna quello esistente):

- Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`
- **Nessun** token in query (Stripe non invia JWT Supabase)
- Signing secret: copiare in `STRIPE_WEBHOOK_SECRET` su Supabase Edge

Script alternativo:

```bash
node scripts/create-stripe-room-webhook.mjs \
  https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-room-webhook
```

## Segreti Edge (Dashboard → Edge Functions → Secrets)

| Variabile | Uso |
| :--- | :--- |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` dalla configurazione webhook Stripe |
| `STRIPE_SECRET_KEY` | Chiave API per retrieve PaymentIntent / disattivare Payment Link |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Iniettati automaticamente da Supabase |

## Metadata Payment Link

Su ogni Payment Link / Checkout impostare (vedi `room-payment-link.ts`):

- `mp_flow` = `room_booking`
- `mp_id_prenotazione` = **uuid** `bookings.id`
- `payment_intent_data[metadata][mp_flow]` = `room_booking`
- `payment_intent_data[metadata][mp_id_prenotazione]` = stesso uuid

Opzionale: `client_reference_id` = stesso id prenotazione.

Eventi con `mp_flow` diverso (es. `quota_associativa`) vengono ignorati con **200**.

## Deploy

Prerequisito: progetto linkato a **MusicProSchool** (`mlsiagbrejjylqvcnfbe`).

```bash
# Dalla root workspace (dove c'è supabase/functions)
supabase link --project-ref mlsiagbrejjylqvcnfbe
supabase db push --linked --yes

# 2. Segreti Edge (una tantum o dopo rotazione webhook Stripe)
supabase secrets set \
  STRIPE_WEBHOOK_SECRET='whsec_...' \
  STRIPE_SECRET_KEY='sk_...'

# 3. Deploy Edge Function (verify_jwt = false in config.toml)
supabase functions deploy stripe-room-webhook --no-verify-jwt
```

`verify_jwt = false` è richiesto: Stripe non invia JWT Supabase.  
Config locale: `supabase/config.toml` → `[functions.stripe-room-webhook] verify_jwt = false`

## Comportamento

1. Verifica firma webhook.
2. Per eventi “pagato”, risolve `mp_id_prenotazione` (Session → PaymentIntent se serve).
3. Filtra solo `mp_flow = room_booking`.
4. RPC: `bookings.payment_status = paid`, `status = confirmed`, idempotenza su `payment_intent_id`.
5. Disattiva Payment Link (`pl_...`) dopo primo incasso.

Risposte:

- **200** — ok / ignorato / duplicato idempotente / errore business (prenotazione non trovata)
- **400** — firma non valida
- **500** — errore DB (Stripe ritenta)

## Test locale

```bash
supabase start
supabase functions serve stripe-room-webhook --no-verify-jwt --env-file musicpro/.env

# Altro terminale
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-room-webhook
# Usare il whsec_... stampato da stripe listen come STRIPE_WEBHOOK_SECRET locale
```

## Migrazione da Vercel webhook

1. Deploy Edge + migration `008`. **Fatto.**
2. Stripe Live: endpoint Edge **enabled**; `https://school.musicproeventi.it/api/stripe/webhook` **disabled** (2026-08-15).
3. `STRIPE_WEBHOOK_SECRET` nei segreti Edge. **Fatto.**
4. Rigenera eventi falliti dal periodo di downtime se necessario — Stripe API non consente `events/:id/retry` in live; usare Dashboard se serve.
