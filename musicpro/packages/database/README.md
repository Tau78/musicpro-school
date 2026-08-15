# @musicpro/database

Supabase client factories and data-access helpers for MusicPro School.

## Booking rules (sale prova)

### Who can book

| Role | Requirement |
|------|-------------|
| **admin** | Always allowed; bookings are `confirmed` immediately |
| **docente** | Always allowed; bookings are `confirmed` immediately |
| **associato** | Allowed only if `member_quota_ok()` for the current fiscal year (Europe/Rome); bookings start as `pending` until Stripe payment is wired |
| Others | Not allowed (`NOT_AUTHORIZED`) |

Enforcement layers:

1. **RLS** (`002_rls_policies.sql`) — `can_book_rooms()` on `rooms` SELECT and `bookings` INSERT/SELECT
2. **`create_booking_safe()`** (`005` + `006`) — quota, overlap, pricing, lead-time (12h/6h)
3. **`cancel_booking_safe()`** (`006`) — annullamento con soglia ore (default 24h)

### Booking statuses

- `pending` — associato, anticipo ≥12h; pagamento Stripe da collegare (infrastruttura già presente per iscrizioni)
- `pending_approval` — associato, anticipo 6–12h; approvazione segreteria (admin UI da fare)
- `confirmed` — admin/docente, o associato dopo pagamento/approvazione
- `cancelled` — annullata

### Slots, pricing and timezone

- **Formula prezzo:** `totale = tariffa × ore − sconti durata − sconto PROVI DA SOLO + addon` (Fase 1: solo base via `calculateBookingPrice()`)
- Config per sala in DB (`006`): granularità (default 30 min), durata, tariffe, orari
- Lead-time in `app_settings`: `booking_auto_confirm_min_hours` (12), `booking_approval_min_hours` (6), `booking_cancel_min_hours` (24)
- Display timezone: **Europe/Rome**

### Conflict handling

`UNIQUE(room_id, start_at)` prevents double-booking. `create_booking_safe` returns:

| `error_code` | Italian message |
|--------------|-----------------|
| `SLOT_TAKEN` | Questo slot è già prenotato. Scegli un altro orario. |
| `TOO_LATE` | Anticipo insufficiente (<6h) |
| `CANCEL_TOO_LATE` | Annullamento oltre soglia ore |
| `QUOTA_NOT_PAID` | Devi aver pagato la quota associativa per prenotare le sale. |
| `NOT_AUTHORIZED` | Non hai i permessi per prenotare le sale prova. |
| `NOT_AUTHENTICATED` | Devi effettuare l'accesso per prenotare. |

### Realtime

The `bookings` table is in the `supabase_realtime` publication. Use `subscribeToBookings(client, roomId, callback)` to listen for `postgres_changes` filtered by `room_id`.

### Rooms (seed)

Four practice rooms; after `006` seed names Rossa, Verde, Arancio, Sala 4 with hourly rates.

## API (`src/bookings.ts`)

```ts
import { createBrowserClient, listRooms, getRoomAvailability, createBooking, cancelBooking, subscribeToBookings } from "@musicpro/database";

const supabase = createBrowserClient();
const rooms = await listRooms(supabase);
const availability = await getRoomAvailability(supabase, roomId, "2026-06-11");
const result = await createBooking(supabase, { roomId, memberId, startAt, endAt });
const mine = await listMyBookings(supabase, memberId, "upcoming");
await cancelBooking(supabase, bookingId);
```

## Migrations

Apply in order: `001` → `002` → `003` → `005` → `006` → `007` → `008`.

Regenerate types when schema changes:

```bash
npx supabase gen types typescript --project-id <id> > packages/database/src/types/database.ts
```

### URL web associato

| Path | Uso |
|------|-----|
| `/prenotazioni` | Nuova prenotazione (wizard) |
| `/prenotazioni/mie` | Le mie prenotazioni |
| `/dashboard` | Link di ingresso (non alias URL) |
