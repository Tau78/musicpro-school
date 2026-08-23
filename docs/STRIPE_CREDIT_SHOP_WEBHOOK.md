# Webhook Stripe — SHOP crediti (Supabase Edge)

Endpoint HTTP nativo con verifica firma `Stripe-Signature`. Sostituisce il webhook Next.js su Vercel (`/api/stripe/webhook`) per il flusso `shop_credit_package`.

## Componenti

| Pezzo | Percorso |
| :--- | :--- |
| Edge Function | `supabase/functions/stripe-credit-shop-webhook/` |
| Shared helpers | `supabase/functions/_shared/stripe-webhook.ts` |
| RPC DB | `public.apply_stripe_credit_shop_payment` |
| Idempotenza | `public.stripe_credit_shop_payment_receipts` |

Migration: `supabase/migrations/011_credit_shop.sql`

## URL endpoint (produzione)

Dopo deploy:

```text
https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-credit-shop-webhook
```

In Stripe Dashboard → Webhooks → **Aggiungi endpoint** (o aggiorna quello esistente):

- Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`
- **Nessun** token in query (Stripe non invia JWT Supabase)
- Signing secret: copiare in `STRIPE_CREDIT_SHOP_WEBHOOK_SECRET` su Supabase Edge (fallback: `STRIPE_WEBHOOK_SECRET`)

Script alternativo:

```bash
node scripts/create-stripe-credit-shop-webhook.mjs \
  https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-credit-shop-webhook
```

## Segreti Edge (Dashboard → Edge Functions → Secrets)

| Variabile | Uso |
| :--- | :--- |
| `STRIPE_CREDIT_SHOP_WEBHOOK_SECRET` | `whsec_...` dalla configurazione webhook Stripe SHOP |
| `STRIPE_WEBHOOK_SECRET` | Fallback se il secret dedicato non è impostato |
| `STRIPE_SECRET_KEY` | Chiave API per retrieve PaymentIntent / disattivare Payment Link |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Iniettati automaticamente da Supabase |

## Metadata Payment Link

Su ogni Payment Link / Checkout impostare (vedi `credit-shop-payment-link.ts`):

- `mp_flow` = `shop_credit_package`
- `mp_member_id` = **uuid** `members.id`
- `mp_package_id` = **uuid** `credit_packages.id`
- `payment_intent_data[metadata][mp_flow]` = `shop_credit_package`
- `payment_intent_data[metadata][mp_member_id]` = stesso uuid associato
- `payment_intent_data[metadata][mp_package_id]` = stesso uuid pacchetto

Opzionale: `client_reference_id` = `{memberId}:{packageId}`.

Eventi con `mp_flow` diverso (es. `room_booking`, `quota_associativa`) vengono ignorati con **200**.

## Deploy

Prerequisito: progetto linkato a **MusicProSchool** (`mlsiagbrejjylqvcnfbe`).

```bash
# Dalla root workspace (dove c'è supabase/functions)
supabase link --project-ref mlsiagbrejjylqvcnfbe
supabase db push --linked --yes

# 2. Segreti Edge (una tantum o dopo rotazione webhook Stripe)
supabase secrets set \
  STRIPE_CREDIT_SHOP_WEBHOOK_SECRET='whsec_...' \
  STRIPE_SECRET_KEY='sk_...'

# 3. Deploy Edge Function (verify_jwt = false in config.toml)
supabase functions deploy stripe-credit-shop-webhook --no-verify-jwt
```

`verify_jwt = false` è richiesto: Stripe non invia JWT Supabase.  
Config locale: `supabase/config.toml` → `[functions.stripe-credit-shop-webhook] verify_jwt = false`

## Comportamento

1. Verifica firma webhook.
2. Per eventi “pagato”, risolve `mp_member_id` e `mp_package_id` (Session → PaymentIntent se serve).
3. Filtra solo `mp_flow = shop_credit_package`.
4. RPC: crea `credit_purchases` + `credit_transactions` (tipo `purchase`), idempotenza su `payment_intent_id`.
5. Disattiva Payment Link (`pl_...`) dopo primo incasso.

Risposte:

- **200** — ok / ignorato / duplicato idempotente / errore business (associato o pacchetto non trovato)
- **400** — firma non valida o header mancante
- **500** — errore DB (Stripe ritenta)

## Test locale

```bash
supabase start
supabase functions serve stripe-credit-shop-webhook --no-verify-jwt --env-file musicpro/.env

# Altro terminale
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-credit-shop-webhook
# Usare il whsec_... stampato da stripe listen come STRIPE_CREDIT_SHOP_WEBHOOK_SECRET locale
```

Smoke RPC (senza Stripe):

```bash
node scripts/smoke-stripe-credit-shop-payment.mjs
```

## Migrazione da Vercel webhook

1. Deploy Edge + migration `011`. **Fatto.**
2. Stripe Live: endpoint Edge **enabled**; path Vercel `/api/stripe/webhook` per SHOP **disabled** o filtrato (endpoint dedicato consigliato).
3. `STRIPE_CREDIT_SHOP_WEBHOOK_SECRET` nei segreti Edge.
4. Rigenera eventi falliti dal periodo di downtime se necessario — Stripe API non consente `events/:id/retry` in live; usare Dashboard se serve.
