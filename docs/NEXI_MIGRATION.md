# Pagamenti: Nexi Classic XPay

**Gateway:** Classic XPay (Alias + MAC), **non** NPG / non Stripe.

> **2026-09-27 — implementato.** Quota, sale, shop crediti, iscrizione FTP, pacchetti lezione. Stripe rimosso dal mint e dalle Edge.

**Skill globale:** `#nexi` → `~/.cursor/skills/nexi-xpay/`  
**Riferimento Eventi:** `/Users/mauroandreoni/APP Eventi da GAS/musicpro-eventi-app/docs/NEXI_XPAY_BOOKING.md`

---

## Flusso

```text
[API School] mintNexiPayment → nexi_payment_orders (codTrans)
        ↓
https://school.musicproeventi.it/paga-nexi.html?t=COD
        ↓ fetch Edge pay?format=json
[nexi-xpay-pay] → Dispatcher Nexi
        ├─ urlpost → nexi-xpay-notify → apply_nexi_payment → ACK "OK"
        └─ browser → return_url app  (fallback Edge nexi-xpay-return)
```

`apply_nexi_payment` riusa la logica degli RPC `apply_stripe_*` (idempotenza + effetti: quota, booking, crediti, pack).

## Pezzi

| Pezzo | Path |
| --- | --- |
| Shared MAC | `supabase/functions/_shared/nexi-xpay.ts` |
| Edge pay / notify / return | `supabase/functions/nexi-xpay-*` |
| HTML bridge | `musicpro/apps/web/public/paga-nexi.html` |
| Mint Next | `musicpro/apps/web/src/lib/nexi/mint-payment.ts` |
| Migration | `supabase/migrations/075_nexi_xpay_payments.sql` |
| Smoke | `node scripts/smoke-nexi-xpay.mjs` / `--live` |

## Env (nomi, non valori)

| Variabile | Dove | Uso |
| --- | --- | --- |
| `NEXI_XPAY_ALIAS` | Edge | Alias esercente |
| `NEXI_XPAY_MAC_KEY` | Edge | Chiave MAC |
| `NEXI_XPAY_ENV` | Edge | `test` \| `prod` |
| `NEXI_PAY_PAGE_BASE` | Edge + Vercel | `https://school.musicproeventi.it` |
| `NEXI_ISCRIZIONE_RETURN_URL` | Vercel | fallback `https://iscrizione.musicproeventi.it/` |

Dispatcher test: `https://int-ecommerce.nexi.it/ecomm/ecomm/DispatcherServlet`  
Dispatcher prod: `https://ecommerce.nexi.it/ecomm/ecomm/DispatcherServlet`

`verify_jwt = false` su pay / notify / return.

## Flussi

| Flusso | Avvio | Conferma |
| --- | --- | --- |
| Quota onboarding | `POST /api/onboarding/quota` | notify → `apply_nexi_payment` → `apply_stripe_quota_payment` |
| Quota multi / sollecito | `POST /api/quota-payments` · admin link | idem |
| Iscrizione FTP | `POST /api/iscrizione` | idem + `completaInvioIscrizione` |
| Sala | `POST /api/prenotazioni/.../payment` | notify + calendario + email |
| Shop crediti | `POST /api/shop/purchase` | notify → crediti |
| Pacchetto lezioni | `POST /api/lezioni/checkout` | notify + ricevuta |

**Rimborso sala V1:** registrazione locale; movimento carta dal back office Nexi.

## Go-live

1. `supabase secrets set` Alias/MAC/`NEXI_XPAY_ENV=test` + `NEXI_PAY_PAGE_BASE` (dal `.env` locale, mai in chat).
2. Smoke static + `--live` (RPC, non carta reale).
3. Un pagamento sandbox quota o sala con notify MAC.
4. Flip `NEXI_XPAY_ENV=prod`.
5. Disattiva webhook Stripe in Dashboard (legacy).
