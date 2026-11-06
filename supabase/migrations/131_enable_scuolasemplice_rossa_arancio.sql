-- Lezioni ScuolaSemplice di Rossa e Arancio tornano a bloccare la propria sala.
-- Il cutover SuperSaaS (098) aveva spento questi feed insieme agli altri
-- @import.calendar.google.com. Le sale non sono cambiate: si riaccende solo l'interruttore.

UPDATE public.room_external_calendars AS c
SET
  enabled = true,
  updated_at = now()
FROM public.rooms AS room
WHERE c.room_id = room.id
  AND c.google_calendar_id ILIKE '%@import.calendar.google.com'
  AND (
    (room.slug = 'sala-1' AND c.name = 'Rossa')
    OR (room.slug = 'sala-3' AND c.name = 'Arancio')
  )
  AND c.enabled IS DISTINCT FROM true;
