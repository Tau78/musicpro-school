# Sala test lezioni (`sandbox-test`)

Per provare corsi e lezioni **senza bloccare le sale vere** usare la sala **Sala test lezioni** (slug `sandbox-test`).

- Creata/aggiornata da migration `096_sandbox_lesson_room.sql` (`supabase db push`).
- Visibile in **Lezioni** (web admin/docente, mobile calendario lezioni, tabelloni).
- **Non** compare in prenotazioni sala associati (`/prenotazioni`, app mobile Prenotazioni).

Codice: `listRoomsForLessons()` in `@musicpro/database` (include sandbox); `listRooms()` la esclude.
