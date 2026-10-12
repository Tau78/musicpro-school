-- Sala fittizia per prove didattica: visibile in area lezioni, esclusa dalle prenotazioni associati.

INSERT INTO public.rooms (name, slug, description, capacity, sort_order, is_active)
VALUES (
  'Sala test lezioni',
  'sandbox-test',
  'Solo prove didattica: non compare nelle prenotazioni sala associati.',
  6,
  99,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  capacity = EXCLUDED.capacity,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();
