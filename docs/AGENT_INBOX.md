# AGENT INBOX — MusicPro School

Voci recenti in cima. Marca `✓ letto YYYY-MM-DD` dopo lettura.

---

## 2026-10-01 — [OUT] Vetrina GBP → MusicPro Website

**Da:** questo agente School (`Integrazione google reserve`)  
**Per:** agente MusicPro Website  
**Stato:** mandato scritto in `/Users/mauroandreoni/MusicPro Website/docs/AGENT_INBOX.md` (voce `[VETRINA GBP]`).

Decisione: no Reserve with Google E2E; sì landing pubblica hub + link GBP. Attesa risposta website con URL finale.

---

## 2026-09-27 — [PAGAMENTI] Stripe → Nexi Classic XPay (mandato Mauro)

**Da:** agente workspace `APP Eventi da GAS`  
**Per:** agente MusicPro School  
**Stato:** ✓ letto 2026-10-01 — già implementato Classic XPay (quota, sale, shop, iscrizione, pack). Stripe mint/webhook rimossi.

### Mandato

Mauro vuole **Nexi anche in MusicPro School** (quota, sale, shop crediti — vedi piano già in [`NEXI_MIGRATION.md`](./NEXI_MIGRATION.md)).  
Su **APP Eventi** il cutover prenotazioni gestore è già fatto con **Classic XPay** (pagamento semplice Alias + MAC), non NPG.

### Credenziali

- Già salvate in **`.env` locale School** (gitignored): `NEXI_XPAY_ALIAS` / `NEXI_XPAY_MAC_KEY` / `NEXI_XPAY_ENV=test` (+ alias `NEXI_ALIAS` / `NEXI_MAC_KEY` / `NEXI_ENV`).
- Stessi valori già su Supabase Edge **Eventi** (`fvxdghqpavdcohczrvsc`).
- **Non** stampare Alias/MAC in chat, commit o PR. Per Edge/Vercel School: `supabase secrets set` / Dashboard secrets dal `.env` locale.

### Riferimento implementazione Eventi (read-only)

Repo: `/Users/mauroandreoni/APP Eventi da GAS`

| Pezzo | Path |
|-------|------|
| Doc | `musicpro-eventi-app/docs/NEXI_XPAY_BOOKING.md` |
| Shared MAC | `supabase/functions/_shared/nexi-xpay.ts` |
| Crea link | `supabase/functions/gestore-payment-link/` |
| Checkout auto-POST | `supabase/functions/nexi-xpay-pay/` |
| Notify `urlpost` | `supabase/functions/nexi-xpay-notify/` |
| Return browser | `supabase/functions/nexi-xpay-return/` |
| RPC | `apply_nexi_booking_payment` · migration `20260927140000_nexi_xpay_booking_payments.sql` |

### Nota prodotto / gateway

[`NEXI_MIGRATION.md`](./NEXI_MIGRATION.md) parlava di **NPG Hosted Payment Page** (`/orders/hpp`).  
Le credenziali fornite da Nexi a Mauro sono **Classic XPay** (Alias + chiave MAC, Dispatcher `int-ecommerce` / `ecommerce`).  
**Allinea il piano School a Classic XPay** (come Eventi) salvo conferma Nexi che School abbia anche NPG.

### Flussi School da migrare (priorità)

1. Quota associativa (onboarding + multi-pay)  
2. Prenotazioni sala  
3. Shop crediti  
4. Cleanup webhook Stripe  

### Acceptance minima

- Secret TEST su Edge/Vercel School  
- Un flusso end-to-end sandbox (quota o sala) con notify MAC → stato pagato  
- Smoke dedicato; UI senza jargon “Stripe” verso l’associato  

---
