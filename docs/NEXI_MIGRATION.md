# Migrazione pagamenti: Stripe → Nexi (XPay)

**Obiettivo:** un solo gateway Nexi per quota associativa, prenotazioni sale, shop crediti (e refund dove serve).  
**Riferimento tecnico:** [Nexi Hosted Payment Page](https://developer.nexi.it/en/modalita-di-integrazione/hosted-payment-page) (`POST /orders/hpp` + `notificationUrl` + `GET /orders/{orderId}`).

---

## Cosa sostituiamo oggi (Stripe)

| Flusso | Avvio pagamento | Conferma | RPC DB |
|--------|-----------------|----------|--------|
| Quota associativa onboarding | `POST /api/onboarding/quota` → Payment Link Stripe | Edge `stripe-quota-webhook` | `apply_stripe_quota_payment` |
| Quota multi (rubrica) | `POST /api/quota-payments` | idem | idem |
| Prenotazione sala | `requestRoomBookingPaymentUrl` → Payment Link | Edge `stripe-room-webhook` | `apply_stripe_room_booking_payment` |
| Shop crediti | `POST /api/shop/purchase` | Edge `stripe-credit-shop-webhook` | `apply_stripe_credit_shop_payment` |
| Iscrizione PDF (sito FTP) | `api/iscrizione` + webhook Next | `api/stripe/webhook` | enrollment + quota |

**Refund annullamento sala:** `room-booking-refund.ts` (Stripe Refunds API) — va replicato con API Nexi o rimborso manuale + flag admin.

---

## Modello Nexi consigliato (HPP)

Per ogni pagamento:

1. **Crea ordine** lato server (`POST /orders/hpp`) con:
   - `orderId` univoco (es. `room-{bookingId}`, `quota-{memberId}-{year}`, `shop-{purchaseId}`)
   - `amount` in centesimi, `currency: EUR`
   - `resultUrl` → pagina ritorno web (`/prenotazioni/mie?dopoPagamento=1`, `/onboarding/quota?dopoPagamento=1`, …)
   - `notificationUrl` → Edge Function HTTPS pubblica (TLS 1.2, no auth basic)
2. **Salva** `securityToken` + `orderId` in tabella pagamento (nuova colonna o tabella `payment_orders`)
3. **Redirect** associato a `hostedPage`
4. **Webhook** Nexi → valida token → idempotente → RPC conferma (stesso pattern degli smoke Stripe)
5. **Return URL** → pagina “pagamento in elaborazione” + poll `GET /orders/{orderId}` se webhook lento

Secret da Nexi back office:

- `NEXI_API_KEY` / alias + `NEXI_MAC` (o API key REST secondo contratto)
- Ambiente test vs produzione (URL gateway diversi)
- Terminal ID / merchant code per report

---

## Piano implementazione (fette)

### Fase A — Infrastruttura comune

- [ ] Pacchetto `musicpro/apps/web/src/lib/nexi/` (client HPP, firma, parse webhook)
- [ ] Edge `nexi-payment-webhook` (un endpoint, routing per `mp_flow` nel metadata ordine)
- [ ] Tabella `payment_gateway_orders` (`order_id`, `flow`, `ref_id`, `security_token`, `status`, `amount_cents`)
- [ ] RPC generiche rinominate (es. `apply_room_booking_payment`) senza “stripe” nel nome — wrapper temporaneo che chiama la stessa logica

### Fase B — Quota associativa (priorità: sblocca prenotazioni)

- [ ] Sostituire `createStripePaymentLinkQuotaAssociativa` in `/api/onboarding/quota`
- [ ] Webhook → `apply_stripe_quota_payment` (rinominare o nuova `apply_quota_payment`)
- [ ] Smoke: `scripts/smoke-nexi-quota-payment.mjs` (mock webhook come stripe)

### Fase C — Prenotazioni sale

- [ ] `room-payment-link.ts` → Nexi HPP
- [ ] Conferma booking + blocca slot (già in RPC)
- [ ] Refund: API Nexi o workflow admin “rimborso manuale” in V1 Nexi

### Fase D — Shop crediti

- [ ] `/api/shop/purchase` → Nexi
- [ ] Webhook accredito crediti

### Fase E — Cleanup Stripe

- [ ] Rimuovere dipendenza `stripe` da `@musicpro/web`
- [ ] Disabilitare Edge `stripe-*-webhook`
- [ ] Aggiornare `scripts/vai.sh` smoke HTTP (endpoint Nexi)
- [ ] Documentazione env Vercel + Supabase secrets

**Non toccare in prima fase:** lezioni wallet / pacchetti docente se ancora su Stripe — decidere se restano Stripe o migrano dopo.

---

## Env (target)

| Variabile | Dove | Uso |
|-----------|------|-----|
| `NEXI_API_KEY` | Vercel server | Creazione ordini HPP |
| `NEXI_MAC_KEY` | Vercel + Edge | Firma / validazione (se prevista dal contratto) |
| `NEXI_ENV=test\|prod` | Vercel + Edge | URL gateway |
| `NEXI_WEBHOOK_SECRET` | Supabase Edge | Validazione notificationUrl |
| `NEXI_TERMINAL_ID` | Vercel | Terminal back office |

---

## Checklist operativa Nexi (tu)

1. Contratto Nexi attivo + terminale e-commerce abilitato
2. Back office: abilita **Hosted Payment Page**, 3DS, URL di test
3. Fornisci credenziali **sandbox** (API key, MAC, terminal)
4. Whitelist URL: `https://school.musicproeventi.it/.../result` e Edge webhook Supabase
5. Dopo sandbox OK: credenziali **live** + primo pagamento reale quota + sala

---

## Ordine consigliato go-live Nexi

1. Sandbox quota → smoke verde  
2. Sandbox sala → smoke verde  
3. Sandbox shop crediti  
4. Switch env produzione  
5. Disattiva webhook Stripe in Dashboard Stripe (solo dopo Nexi live verificato)

Quando hai credenziali sandbox Nexi, apri una sessione implementazione: Fase A+B prima (quota), poi sale.
