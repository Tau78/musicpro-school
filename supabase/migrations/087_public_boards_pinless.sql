-- Tabelloni: niente PIN globale; display attivo di default; colonne booking-oriented.

ALTER TABLE public.public_display_settings
  DROP COLUMN IF EXISTS pin;

ALTER TABLE public.public_display_settings
  ALTER COLUMN enabled SET DEFAULT TRUE;

UPDATE public.public_display_settings
SET enabled = TRUE
WHERE id = TRUE;

DROP FUNCTION IF EXISTS public.generate_board_pin();

-- Aggiorna il tabellone seed (nome MusicPro) alle colonne sala/allievo.
UPDATE public.public_boards
SET
  columns = '[
    {"key":"start_time","boardLabel":"Ora","listLabel":"Ora"},
    {"key":"room","boardLabel":"Sala","listLabel":"Sala"},
    {"key":"who","boardLabel":"Allievo / Band","listLabel":"Allievo / Band"},
    {"key":"instrument","boardLabel":"Strumento","listLabel":"Strumento"},
    {"key":"microphones","boardLabel":"Microfoni","listLabel":"Microfoni"},
    {"key":"solo","boardLabel":"Da solo","listLabel":"Da solo"}
  ]'::JSONB,
  updated_at = NOW()
WHERE name = 'MusicPro'
  AND kind = 'timetable'
  AND sort_order = 0;
