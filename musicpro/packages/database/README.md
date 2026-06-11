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
2. **`create_booking_safe()`** (`005_booking_functions.sql`) — quota/role checks, `UNIQUE(room_id, start_at)` → Italian `SLOT_TAKEN` message

### Booking statuses

- `pending` — associato booking awaiting payment (Stripe hook placeholder: `initiateRoomPayment()`)
- `confirmed` — active reservation (admin/docente, or associato after future payment)
- `cancelled` — member cancelled own booking, or admin cancelled

### Slots and timezone

- Display timezone: **Europe/Rome** (`BOOKING_TIMEZONE`)
- Default slots: hourly from **09:00** to **22:00** local time
- Stored in DB as `timestamptz` (UTC); UI formats via `formatDateItalian()` / slot labels

### Conflict handling

`UNIQUE(room_id, start_at)` prevents double-booking. `create_booking_safe` returns:

| `error_code` | Italian message |
|--------------|-----------------|
| `SLOT_TAKEN` | Questo slot è già prenotato. Scegli un altro orario. |
| `QUOTA_NOT_PAID` | Devi aver pagato la quota associativa per prenotare le sale. |
| `NOT_AUTHORIZED` | Non hai i permessi per prenotare le sale prova. |
| `NOT_AUTHENTICATED` | Devi effettuare l'accesso per prenotare. |

### Realtime

The `bookings` table is in the `supabase_realtime` publication. Use `subscribeToBookings(client, roomId, callback)` to listen for `postgres_changes` filtered by `room_id`.

### Rooms (seed)

Four practice rooms from `003_seed_data.sql`: Sala 1–4 (`sala-1` … `sala-4`).

## API (`src/bookings.ts`)

```ts
import { createBrowserClient, listRooms, getRoomAvailability, createBooking, cancelBooking, subscribeToBookings } from "@musicpro/database";

const supabase = createBrowserClient();
const rooms = await listRooms(supabase);
const availability = await getRoomAvailability(supabase, roomId, "2026-06-11");
const result = await createBooking(supabase, { roomId, memberId, startAt, endAt });
const unsubscribe = subscribeToBookings(supabase, roomId, () => { /* refresh slots */ });
```

## Migrations

Apply in order: `001` → `002` → `003` → `005_booking_functions.sql`.

Regenerate types when schema changes:

```bash
npx supabase gen types typescript --project-id <id> > packages/database/src/types/database.ts
```
