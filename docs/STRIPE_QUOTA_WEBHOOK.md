# Webhook Stripe — quota associativa e multi-pay (Supabase Edge)

Endpoint HTTP nativo con verifica firma `Stripe-Signature`. Sostituisce il webhook Next.js su Vercel (`/api/stripe/webhook`) per i flussi `quota_associativa` e `quota_multi_pay`.

## Componenti

| Pezzo | Percorso |
| :--- | :--- |
| Edge Function | `supabase/functions/stripe-quota-webhook/` |
| Shared helpers | `supabase/functions/_shared/stripe-webhook.ts` |
| RPC DB | `public.apply_stripe_quota_payment` |
| Idempotenza | `public.stripe_quota_payment_receipts` |

Migration: `supabase/migrations/025_quota_payment_webhook.sql` (dipende da `022_bands_and_quota_payments.sql`)

## URL endpoint (produzione)

Dopo deploy:

```text
https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-quota-webhook
```

In Stripe Dashboard → Webhooks → **Aggiungi endpoint** (o aggiorna quello esistente):

- Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`
- **Nessun** token in query (Stripe non invia JWT Supabase)
- Signing secret: copiare in `STRIPE_QUOTA_WEBHOOK_SECRET` su Supabase Edge (fallback: `STRIPE_WEBHOOK_SECRET`)

Script alternativo:

```bash
node scripts/create-stripe-quota-webhook.mjs \
  https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/stripe-quota-webhook
```

## Segreti Edge (Dashboard → Edge Functions → Secrets)

| Variabile | Uso |
| :--- | :--- |
| `STRIPE_QUOTA_WEBHOOK_SECRET` | `whsec_...` dalla configurazione webhook Stripe quota |
| `STRIPE_WEBHOOK_SECRET` | Fallback se il secret dedicato non è impostato |
| `STRIPE_SECRET_KEY` | Chiave API per retrieve PaymentIntent / disattivare Payment Link |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Iniettati automaticamente da Supabase |

## Metadata Payment Link

### Quota associativa (onboarding iscrizione)

Vedi `stripe-payment-link.ts` (iscrizione):

- `mp_flow` = `quota_associativa`
- `mp_id_iscrizione` = **uuid** `enrollments.id`
- `payment_intent_data[metadata][mp_flow]` = `quota_associativa`
- `payment_intent_data[metadata][mp_id_iscrizione]` = stesso uuid iscrizione

### Quota multi-pay (band)

Vedi `quota-multi-payment-link.ts`:

- `mp_flow` = `quota_multi_pay`
- `mp_quota_payment_id` = **uuid** `quota_payments.id`
- `payment_intent_data[metadata][mp_flow]` = `quota_multi_pay`
- `payment_intent_data[metadata][mp_quota_payment_id]` = stesso uuid pagamento

Eventi con `mp_flow` diverso (es. `room_booking`, `shop_credit_package`) vengono ignorati con **200**.

## Deploy

Prerequisito: progetto linkato a **MusicProSchool** (`mlsiagbrejjylqvcnfbe`).

```bash
# Dalla root workspace (dove c'è supabase/functions)
supabase link --project-ref mlsiagbrejjylqvcnfbe
supabase db push --linked --yes

# 2. Segreti Edge (una tantum o dopo rotazione webhook Stripe)
supabase secrets set \
  STRIPE_QUOTA_WEBHOOK_SECRET='whsec_...' \
  STRIPE_SECRET_KEY='sk_...'

# 3. Deploy Edge Function (verify_jwt = false in config.toml)
supabase functions deploy stripe-quota-webhook --no-verify-jwt
```

`verify_jwt = false` è richiesto: Stripe non invia JWT Supabase.  
Config locale: `supabase/config.toml` → `[functions.stripe-quota-webhook] verify_jwt = false`

## Comportamento

1. Verifica firma webhook.
2. Per eventi “pagato”, risolve metadata quota (Session → PaymentIntent se serve).
3. Filtra solo `mp_flow` in `{ quota_associativa, quota_multi_pay }`.
4. RPC:
   - **quota_associativa**: `enrollments.payment_status = PAGATO`, upsert `member_annual_quotas`, promuove `band_members` da `pending_quota`.
   - **quota_multi_pay**: completa `quota_payment_items`, upsert quote annuali per ogni beneficiario.
5. Idempotenza su `stripe_event_id` e `payment_intent_id`.
6. Disattiva Payment Link (`pl_...`) dopo primo incasso.

Risposte:

- **200** — ok / ignorato / duplicato idempotente / errore business (iscrizione o pagamento non trovato)
- **400** — firma non valida o header mancante
- **500** — errore DB (Stripe ritenta)

## Test locale

```bash
supabase start
supabase functions serve stripe-quota-webhook --no-verify-jwt --env-file musicpro/.env

# Altro terminale
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-quota-webhook
# Usare il whsec_... stampato da stripe listen come STRIPE_QUOTA_WEBHOOK_SECRET locale
```

Smoke RPC (senza Stripe):

```bash
node scripts/test-quota-associativa.mjs
node scripts/test-quota-multi-pay.mjs
```

## Migrazione da Vercel webhook

1. Deploy Edge + migration `025`. **Fatto.**
2. Stripe Live: endpoint Edge **enabled**; path Vercel `/api/stripe/webhook` per quota **disabled** o filtrato (endpoint dedicato consigliato).
3. `STRIPE_QUOTA_WEBHOOK_SECRET` nei segreti Edge.
4. Rigenera eventi falliti dal periodo di downtime se necessario — Stripe API non consente `events/:id/retry` in live; usare Dashboard se serve.
