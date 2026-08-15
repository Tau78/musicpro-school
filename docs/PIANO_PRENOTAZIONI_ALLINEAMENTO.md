# Allineamento piano prenotazioni — gap, dubbi, sovrapposizioni

**Data:** 2026-07-08  
**Piano importato:** [`PIANO_PRENOTAZIONI.md`](PIANO_PRENOTAZIONI.md) (da `MusicPro-APP-Associati`, branch `cursor/save-booking-plan-091f`)  
**Implementazione esistente:** monorepo `musicpro/` + `supabase/` in MusicPro School

Questo documento risponde punto per punto alle **sovrapposizioni** (due fonti che coprono lo stesso tema), ai **gap** (nel piano ma non nel codice, o viceversa) e ai **dubbi** (decisioni da prendere prima di procedere).

---

## Legenda

| Simbolo | Significato |
|---------|-------------|
| ✅ | Allineato — nessuna azione urgente |
| ⚠️ | Sovrapposizione / divergenza — serve decisione o refactor |
| ❌ | Gap — da implementare |
| 🔵 | Solo nel piano (design futuro) |
| 🟢 | Solo nel codice (non nel piano originale) |

---

## 1. Quota associativa: Fase 1 o Fase 3?

**Domanda:** Il piano dice che in Fase 1 *chiunque registrato* può prenotare (quota/BAND in Fase 3). Il codice attuale blocca gli associati senza quota. Quale modello seguiamo?

**Sovrapposizione:** sì — stesso requisito, tempistiche diverse.

| Fonte | Comportamento |
|-------|---------------|
| Piano (Fase 1) | Nessun vincolo quota — semplificare test MVP |
| Piano (Fase 3) | Quota obbligatoria + BAND prima di prenotare |
| Codice attuale | `can_book_rooms()` = admin/docente OR (associato AND `member_quota_ok()`) |
| SuperSaaS | Verifica quota (oggi autodichiarazione; piano: verifica reale) |

**Raccomandazione:** **mantenere la quota già attiva** nel codice. Motivi:
- Allineamento con SuperSaaS e con il resto del portale (iscrizione/quota già modellati in Supabase).
- Il piano Fase 1 “senza quota” serviva al repo mock senza backend membership.
- Per test E2E basta un associato di staging con quota pagata (`CUTOVER_CHECKLIST.md`).

**Azione:** aggiornare mentalmente Fase 1 del piano: *quota sì, BAND no*. La BAND resta Fase 3.

---

## 2. Repo e stack: MusicPro-APP-Associati vs MusicPro School

**Domanda:** L’agente cloud ha lavorato nel repo giusto?

**Risposta:** **No.** Il piano descrive un’app Next.js mock (`sessionStorage`, Prisma da zero, path `src/app/...`). L’implementazione reale vive in **MusicPro School**:

| Aspetto | Piano (repo errato) | MusicPro School |
|---------|---------------------|-----------------|
| Database | Prisma + PostgreSQL | Supabase migrations SQL |
| Auth | NextAuth / mock | Supabase Auth + `members` |
| Ruoli | `isAdmin` boolean | `member_roles` enum |
| API booking | Route Handlers | RPC `create_booking_safe()` + RLS |
| Mobile | Solo web responsive | **Expo app** dedicata |
| Admin | Da creare | Parziale (`/admin/associati`, `/admin/rimborsi`) |
| Iscrizione | Non coperta | Flusso Supabase + Stripe in corso |

**Gap:** il piano non menziona Expo, `@musicpro/database`, né la migrazione GAS→Supabase in corso.

**Azione:** usare [`PIANO_PRENOTAZIONI.md`](PIANO_PRENOTAZIONI.md) come **specifica funzionale**; implementare sempre in `musicpro/` + `supabase/`. Ignorare i path `src/` del piano originale.

### ✅ Decisione presa (2026-07-08)

**Stack vincolante:** Supabase + monorepo `musicpro/` (web Next.js + Expo) + `@musicpro/database`. **Non è bloccante** — è lo stack operativo del progetto e copre tutti i requisiti del piano (PostgreSQL, auth, RLS, Realtime, Stripe, admin, mobile).

| Requisito piano | Copertura stack attuale |
|-----------------|-------------------------|
| PostgreSQL relazionale | Supabase Postgres + migrations SQL |
| Auth + ruoli | Supabase Auth + `members` + `member_roles` |
| API booking sicura | RPC `create_booking_safe()` + RLS |
| Realtime disponibilità | Supabase Realtime su `bookings` |
| Admin web | `/admin/*` (pattern già usato per associati/rimborsi) |
| Mobile associati | Expo (`musicpro/apps/mobile`) — **plus** rispetto al piano originale |
| Pagamenti | Stripe (iscrizioni già in corso; estendere a sale) |

Prisma, NextAuth e path `src/` del repo errato **non si adottano**. Eventuali estensioni (Google Calendar, cron sync) si integrano nello stack esistente (Edge Functions / Vercel cron / Route Handlers dove serve), non sostituiscono Supabase.

---

## 3. Sale: configurazione admin per sala

**Domanda:** Le sale del seed coincidono con SuperSaaS? Dove vivono tariffe e opzioni?

**Gap attuale:** ❌ — tabella `rooms` minimale; seed `Sala 1`–`4` senza pricing; nessuna UI admin spazi.

| | SuperSaaS (riferimento) | Codice attuale |
|--|-------------------------|----------------|
| Nomi | Rossa, Verde, Arancio (+ eventuale quarta) | Sala 1–4 (placeholder) |
| Tariffe | 10 / 15 / 15 €/h | Nessun campo |
| Config | Pannello SuperSaaS | Non implementato |

### ✅ Decisione presa (2026-07-08)

**Non** si modella il pricing solo con una migration che aggiunge `hourly_rate_eur` al seed. Ogni sala avrà una **pagina di configurazione admin** dedicata (`/admin/spaces/[id]` o equivalente), dove la segreteria gestisce l’intero ciclo di vita dello spazio:

| Sezione config sala | Contenuto |
|---------------------|-----------|
| Anagrafica | Nome, slug, descrizione, capacità, abilitata/disabilitata |
| **Tariffa oraria** | Prezzo base €/h (es. Rossa 10, Verde/Arancio 15) |
| **Orari apertura/chiusura** | Griglia settimanale per giorno |
| **Slot e durata** | Granularità (es. 30 min), durata min/max prenotazione, incrementi |
| **Sconti per durata** | Fasce ore prenotate → sconto % o € (es. 5h −10%) — configurabili per sala |
| **PROVI DA SOLO** | Flag, orari dedicati, tipo/valore sconto |
| **Opzioni aggiuntive** | Microfoni, attrezzature, addon con prezzo/sconto |
| **Pacchetti** | Sconti a pacchetto legati alla sala (se distinti da SHOP crediti globali) |
| **Calendari esterni** | Import calendari aule scuola (Fase 2) |
| **Google Calendar publish** | Calendar ID dedicato per spazio |

I valori SuperSaaS (Rossa/Verde/Arancio) sono **default di seed o prima configurazione manuale**, non vincolo di schema fisso.

**Implementazione:** estendere schema Supabase (tabelle normalizzate: `room_opening_hours`, `room_duration_discounts`, `room_options`, …) + CRUD admin. Il motore prenotazione **legge** sempre da DB config, mai da costanti in `bookings.ts`.

**Dubbio residuo:** nome e tariffa della quarta sala — si definisce in admin al go-live, non in migration.

---

## 4. Slot, durata, granularità e sconti per ore

**Domanda:** Il motore slot attuale è sufficiente? I 30 min / 2h sliding vanno hardcoded?

**Gap attuale:** ❌ — `bookings.ts` usa costanti `SLOT_OPEN_HOUR`, `SLOT_CLOSE_HOUR`, `SLOT_DURATION_MINUTES = 60`.

| | Piano SuperSaaS | Codice oggi |
|--|-----------------|-------------|
| Granularità | 30 min (tipico) | 60 min fisso |
| Durata | Variabile (es. 2h sliding) | Sempre 1h |
| Orari | Per giorno configurabile | Hardcoded 09:00–22:00 |
| Sconti per ore prenotate | Sì (admin → spazio) | No |

### ✅ Decisione presa (2026-07-08)

Slot, durata e sconti **non vanno hardcoded** nel refactor pre-go-live. Devono essere **opzioni configurabili per sala** (stessa pagina admin di §3), con default sensati allineati a SuperSaaS:

| Parametro | Default suggerito (go-live) | Dove si configura |
|-----------|----------------------------|-------------------|
| Granularità slot | 30 min | Admin → sala → Slot e durata |
| Durata min/max | es. 2h min e max (o range 1–4h) | Idem |
| Orari apertura | da griglia settimanale | Admin → sala → Orari |
| Sconti per durata | es. 5h −10%, 10h −15% | Admin → sala → Sconti per durata |

**Fasi di implementazione:**

| Fase | Cosa fare |
|------|-----------|
| **Fase 1 (MVP)** | Motore availability **legge config sala** dal DB; default 30 min / 2h / orari seed finché l’admin UI non è pronta. Rimuovere costanti hardcoded da `bookings.ts`. |
| **Fase 2** | UI admin completa per tutte le opzioni slot + sconti durata; validazione server-side in RPC/pricing. |

Il calcolo prezzo finale segue la **formula ufficiale**:

`totale = tariffa × ore − sconti durata − sconto PROVI DA SOLO + addon`

Fase 1 implementa solo la base; sconti e addon da config admin sala (Fase 2).

**Non bloccante per avviare Fase 1:** si può partire con config DB + default JSON per sala; l’UI admin può arrivare subito dopo il motore che la consuma.

**Altri gap UI (invariati):** "Trova prossimo slot", calendario globale multi-sala — possono seguire dopo MVP lista slot.

---

## 5. Stati prenotazione e lead-time

**Stato (2026-07-08):** ✅ implementato in `006_booking_config.sql`

- Enum `pending_approval` aggiunto
- Lead-time 12h / 6h in `create_booking_safe()`
- Annullamento con soglia 24h in `cancel_booking_safe()`
- Prezzo salvato su `bookings.total_price_eur`

**Ancora da fare:** UI admin approva/rifiuta per `pending_approval`; `payment_status` Stripe separato (quando si collega Checkout).

---

## 6. Pagamento Stripe sale

**Domanda:** Abbiamo già tutto per Stripe, sbaglio?

**Risposta:** **Quasi.** Per le **iscrizioni/quota** sì:

- `stripe-config.ts`, Payment Links, webhook path documentato in cutover
- Chiavi `STRIPE_*` in `.env`

**Manca solo il collegamento alle sale** (non è un nuovo account Stripe):

| Già pronto | Da fare (~1 route + webhook) |
|------------|------------------------------|
| Chiavi e config Stripe | Checkout Session con `metadata.booking_id` |
| Pattern webhook iscrizioni | Handler che conferma booking → `confirmed` |
| | Product/Price Stripe “ora sala” (o importo dinamico) |

Fino al collegamento, l’associato vede la prenotazione in **`/prenotazioni/mie`** con stato `pending` o `pending_approval` — flusso utilizzabile senza email.

---

## 7. Admin prenotazioni

**Domanda:** Cosa ti serve?

**Per Fase 1 minimo:**

| Componente | Serve per |
|------------|-----------|
| `/admin/bookings` lista | Vedere prenotazioni, filtro `pending_approval` |
| Azioni Approva / Rifiuta | Fascia 6–12h (oggi il DB crea già `pending_approval`) |
| Calendario admin | Nice-to-have subito dopo lista |

**Dipendenze:** nessuna extra oltre Supabase + pattern admin esistente (`/admin/rimborsi`). Non blocca prenotazione/annullamento lato associato.

---

## 8. Google Calendar publish

**Domanda:** Cosa ti serve?

| Requisito | Dettaglio |
|-----------|-----------|
| Account Google | `musicproeventi@gmail.com` |
| OAuth una tantum | Refresh token in env / Supabase secret |
| `google_calendar_id` per sala | Campo config sala (admin) |
| Sync | Edge Function o cron su insert/update/delete booking `confirmed` |

**Non blocca Fase 1 associato** — la segreteria può gestire sale senza GCal finché non si configura OAuth. Utile prima del go-live SuperSaaS.

---

## 9. Sistema BAND, SHOP, PROVI DA SOLO

**Domanda:** C’è sovrapposizione con codice esistente?

**Risposta:** **No** — 🔵 interamente nel piano (Fase 2–3). Nessuna tabella `bands`, `credit_transactions`, ecc.

| Feature | Fase piano | Codice |
|---------|------------|--------|
| BAND + inviti | 3 | ❌ |
| SHOP crediti | 2 | ❌ |
| PROVI DA SOLO (flag + orari) | 2 | ❌ |
| Versamento quota multiplo | 3 | ❌ (quota singola via `member_annual_quotas`) |

**Sovrapposizione futura:** il modello `members` + `member_annual_quotas` + Stripe iscrizione copre già **quota individuale**; il piano aggiunge `QuotaPayment`/`QuotaPaymentItem` per pagamenti multipli — estensione naturale, non conflitto.

---

## 10. Auth, ruoli e chi può prenotare

**Domanda:** Il modello ruoli del piano coincide?

| Piano | MusicPro School |
|-------|-----------------|
| `isAdmin` | `member_roles`: `admin`, `segreteria`, `docente`, `associato`, … |
| Solo `member` + admin | Docente prenota **senza** quota (🟢 già nel codice, non esplicito nel piano SuperSaaS) |
| Tutore | Non nel piano booking | Esiste `tutor_links` — **dubbio:** tutore può prenotare? Oggi **no** (`can_book_rooms` non include tutore) |

**Dubbio da chiudere:** i **tutori** devono prenotare sale per i minori? Se sì, estendere RLS; se no, documentare esplicitamente.

---

### ✅ Decisione URL ufficiale (2026-07-08)

**Namespace associato:** `/prenotazioni` — tutto ciò che riguarda le sale prova lato associato.

| URL | Ruolo |
|-----|--------|
| `/prenotazioni` | Wizard nuova prenotazione |
| `/prenotazioni/mie` | Future, storico, annullamento |
| `/prenotazioni/*` | Sotto-pagine future (es. `/prenotazioni/mie/[id]` per dettaglio) |
| `/dashboard` | Solo **link** «Prenota una sala» / «Le mie prenotazioni» — nessun alias `/dashboard/bookings` |

**Non adottato:** `/dashboard/bookings/*` del piano importato (inglese, repo errato).

**Mobile:** tab Expo `prenotazioni` — parità funzionale con `/prenotazioni` web.

---

### ✅ Formula prezzo ufficiale (2026-07-08)

```
totale = tariffa × ore − sconti durata − sconto PROVI DA SOLO + addon
```

| Componente | Operazione | Stato codice |
|--------------|------------|----------------|
| `tariffa × ore` | Base | ✅ `calculateBookingPrice()` + `create_booking_safe()` |
| Sconti durata | − | Fase 2 (config admin sala) |
| PROVI DA SOLO | − | Fase 2 |
| Addon | + | Fase 2 |

Il motore **non** hardcoda sconti: leggerà config sala quando le tabelle/UI admin saranno pronte.

---

## 11. UI/UX e percorsi (implementazione)

**Implementato:** wizard 3 step, `/prenotazioni/mie`, link da `/dashboard`.

---

## 12. Realtime

**Domanda:** Il piano prevede aggiornamenti live?

| Piano | Codice |
|-------|--------|
| Non esplicitato in dettaglio | ✅ `subscribeToBookings()` + publication Supabase |

**Allineamento:** ✅ il codice è **avanti** al piano su questo punto.

---

## 13. Email conferma e policy cancellazione

**Domanda:** Fase 1 richiede email? Si può fare solo con login?

**Risposta:** **Sì — Fase 1 senza email.**

| Funzione Fase 1 | Canale |
|-----------------|--------|
| Prenotare | Wizard + conferma a schermo |
| Vedere prenotazioni | `/prenotazioni/mie` (login) |
| Annullare | Pulsante in «Le mie» + `cancel_booking_safe` |

L’**email transazionale** (template SuperSaaS) resta **miglioramento** post-MVP — utile ma non bloccante. La policy 24h annullamento è **già nel DB** (`booking_cancel_min_hours`).

**Modifica orario:** Fase 1 = annulla (se ≥24h) + riprenota, oppure segreteria/admin (UI admin da fare).

---

## 14. Migrazione dati SuperSaaS

**Domanda:** Importiamo prenotazioni storiche?

**Allineamento:** ✅ entrambi dicono **partenza pulita**, nessun import SuperSaaS.

**Azione go-live:** redirect URL SuperSaaS → nuova app; comunicazione associati.

---

## 15. GAS / legacy

**Domanda:** Esisteva booking in GAS?

**Risposta:** **No** — confermato in `GAS_DEPRECATION.md` §2.6.

**Sovrapposizione:** nessuna. Il piano SuperSaaS sostituisce solo SuperSaaS, non codice legacy interno.

---

## Matrice riassuntiva

| # | Tema | Tipo | Priorità |
|---|------|------|----------|
| 1 | Quota in Fase 1 | ✅ Decisione | Mantieni quota attuale |
| 2 | Repo/stack | ✅ Decisione | Supabase + monorepo — stack ufficiale |
| 3 | Config sale admin | ❌ Gap | Alta — pagina per sala, non solo seed |
| 4 | Slot/durata/sconti | ✅ Parziale | Config DB + wizard; UI admin sale da fare |
| 5 | Stati + lead-time | ✅ | Migration 006 |
| 6 | Stripe sale | ❌ Gap | Alta |
| 7 | Admin booking | ❌ Gap | Alta |
| 8 | Google Calendar publish | ❌ Gap | Alta |
| 9 | BAND / SHOP / PROVI DA SOLO | 🔵 Fase 2–3 | Dopo gate Fase 1 |
| 10 | Ruolo tutore | 🔵 Dubbio | Media — decidere |
| 11 | Percorsi UI | ✅ | `/prenotazioni`, `/prenotazioni/mie`, dashboard |
| 12 | Realtime | ✅ | Già ok |
| 13 | Email / penali | ✅ Fase 1 | Cancel 24h in DB; email opzionale |
| 14 | Migrazione SuperSaaS | ✅ | N/A |
| 15 | GAS | ✅ | N/A |

---

## Decisioni da prendere (checklist)

- [x] **Stack tecnico:** Supabase + monorepo + Expo — confermato, non bloccante
- [x] **Config sale:** pagina admin per sala (tariffe, slot, sconti, PROVI DA SOLO, opzioni) — non solo migration seed
- [x] **Slot/durata/sconti:** configurabili per sala; default SuperSaaS fino a UI admin
- [ ] **Quota Fase 1:** confermare mantenimento verifica quota (raccomandato: sì)
- [ ] **Quarta sala:** nome e tariffa — si imposta in admin al go-live
- [x] **URL prenotazioni:** `/prenotazioni` + `/prenotazioni/mie`
- [ ] **Tutori:** possono prenotare sale? sì/no
- [ ] **Calendario globale:** obbligatorio Fase 1 o post-MVP?
- [ ] **Promo PROVI DA SOLO:** importo sconto definitivo (placeholder −2€ ok in config)

---

## Prossimi passi consigliati (ordine)

1. **Schema Supabase** — tabelle config sala (orari, slot, tariffe, sconti durata, opzioni); estendere stati booking  
2. **Motore availability/pricing** — legge config DB; rimuovere costanti da `bookings.ts`; default SuperSaaS in seed  
3. **Admin `/admin/spaces/[id]`** — pagina configurazione sala (MVP: tariffe + orari + slot; poi sconti e PROVI DA SOLO)  
4. **Admin `/admin/bookings`** — lista, approva/rifiuta, annulla  
5. **Stripe Checkout + webhook** booking  
6. **Google Calendar** publish per spazio  
7. **UI associato** — wizard + "Le mie prenotazioni" + link dashboard; parità Expo  
8. **Test E2E** (`CUTOVER_CHECKLIST.md` § Booking test)  
9. **Gate** → Fase 2 (SHOP crediti globali, PROVI DA SOLO UI completa, calendari esterni, penali)

---

## Riferimenti codice attuale

| Componente | Path |
|------------|------|
| Schema `rooms` / `bookings` | `supabase/migrations/001_initial_schema.sql` |
| RLS + `can_book_rooms()` | `supabase/migrations/002_rls_policies.sql` |
| Seed sale | `supabase/migrations/003_seed_data.sql` |
| `create_booking_safe()` | `supabase/migrations/005_booking_functions.sql` |
| Client TS | `musicpro/packages/database/src/bookings.ts` |
| Regole documentate | `musicpro/packages/database/README.md` |
| UI web | `musicpro/apps/web/src/app/prenotazioni/page.tsx` |
| UI mobile | `musicpro/apps/mobile/app/(tabs)/prenotazioni.tsx` |
| Cutover test | `docs/CUTOVER_CHECKLIST.md` |
