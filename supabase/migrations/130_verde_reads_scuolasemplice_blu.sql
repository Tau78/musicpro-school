-- Lezioni ScuolaSemplice della ex sala Blu occupano la Verde.
-- Il cutover SuperSaaS (098) ha spento ogni feed @import.calendar.google.com,
-- compreso questo calendario lezioni. La sala Blu è spenta: il feed si legge sulla Verde.
-- Rossa e Arancio non si spostano: le riaccende la migration 131.

UPDATE public.room_external_calendars AS c
SET
  room_id = verde.id,
  enabled = true,
  updated_at = now()
FROM public.rooms AS verde
WHERE verde.slug = 'sala-2'
  AND c.name = 'Blu'
  AND c.google_calendar_id ILIKE '%@import.calendar.google.com'
  AND (
    c.room_id IS DISTINCT FROM verde.id
    OR c.enabled IS DISTINCT FROM true
  );
