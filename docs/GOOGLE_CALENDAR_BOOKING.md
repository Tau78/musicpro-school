# Google Calendar — prenotazioni sale

Sincronizzazione automatica delle prenotazioni **confermate** sul calendario principale MusicPro.

## Calendario principale

| Campo | Valore |
| :--- | :--- |
| **Calendar ID** | `17ktlmh2cg7bsiklkhf04sdt7c@group.calendar.google.com` |
| **Link UI** | [Google Calendar](https://calendar.google.com/calendar/u/0?cid=MTdrdGxtaDJjZzdic2lrbGtoZjA0c2R0N2NAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ) |
| **Setting DB** | `app_settings.booking_google_calendar_id` |

## Lettura calendario (disponibilità slot)

Il wizard web chiama `GET /api/prenotazioni/availability`, che:

1. Carica prenotazioni DB (overlap corretto, inclusi eventi a cavallo di mezzanotte)
2. Invoca Edge `calendar-availability` → `events.list` sul calendario principale
3. Filtra eventi per sala (`colorId` o titolo `SALA - …`)
4. Unisce busy calendar + prenotazioni → slot non disponibili nascosti in UI

Se Google Calendar non è raggiungibile, la disponibilità resta basata solo su DB (degradazione graceful).

## Scrittura calendario (prenotazioni confermate)

| Campo | Regola |
| :--- | :--- |
| **Titolo** | `SALA - ASSOCIATO` → es. `ROSSA - MARIO ROSSI` |
| **Colore** | `colorId` Google per sala (Rossa=11, Verde=10, Arancio=6, Sala 4=7) |
| **Descrizione** | Note ricche: sala, associato, orari, importo, pagamento, ID, link admin |
| **Timezone** | `Europe/Rome` |
| **Idempotenza** | `extendedProperties.private.musicpro_booking_id` |

## Quando sincronizza

| Evento | Azione |
| :--- | :--- |
| Pagamento Stripe → `confirmed` | Upsert (Edge `stripe-room-webhook`) |
| Admin/docente → `confirmed` immediato | Upsert (API dopo create) |
| Annullamento | Delete evento Google |

Non sincronizza su `pending`, `pending_approval` o prima del pagamento.

## Componenti

| Pezzo | Percorso |
| :--- | :--- |
| Migration | `supabase/migrations/010_booking_google_calendar.sql` |
| Google API helper | `supabase/functions/_shared/google-calendar.ts` |
| Sync logic | `supabase/functions/_shared/booking-calendar-sync.ts` |
| Edge Function | `supabase/functions/booking-calendar-sync` |
| API Next.js | `musicpro/apps/web/src/app/api/bookings/[id]/calendar-sync` |

## Segreti Edge (Supabase)

```bash
# JSON service account (delega dominio → musicproeventi@gmail.com)
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

supabase secrets set GOOGLE_CALENDAR_ACT_AS_EMAIL='musicproeventi@gmail.com'
supabase secrets set BOOKING_GOOGLE_CALENDAR_ID='17ktlmh2cg7bsiklkhf04sdt7c@group.calendar.google.com'
supabase secrets set SCHOOL_PUBLIC_URL='https://school.musicproeventi.it'
```

Il service account deve avere accesso **in scrittura/lettura** al calendario.

**Opzione A (consigliata):** condividi il calendario con l'email del service account (es. `musicproschool@musicpro-eventi.iam.gserviceaccount.com`) con permesso *Apportare modifiche agli eventi*. Non serve `GOOGLE_CALENDAR_ACT_AS_EMAIL`.

**Opzione B:** domain-wide delegation in Google Workspace + `GOOGLE_CALENDAR_ACT_AS_EMAIL=musicproeventi@gmail.com` (solo se la delega è attiva in Admin Console).

## Deploy

```bash
supabase db push --linked --yes
supabase functions deploy booking-calendar-sync --no-verify-jwt
supabase functions deploy stripe-room-webhook --no-verify-jwt
```

## Test manuale

```bash
curl -X POST "https://mlsiagbrejjylqvcnfbe.supabase.co/functions/v1/booking-calendar-sync" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"booking_id":"<uuid-confirmed>"}'
```

Verifica su Google Calendar: titolo, colore sala, descrizione completa.
