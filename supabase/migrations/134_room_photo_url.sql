-- Foto sala gestibile da Admin → Sale → tab Sala.
-- URL pubblico (path relativo /… o https); null = fallback legacy nel picker.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN public.rooms.photo_url IS
  'URL foto sala per picker prenotazioni (https o path /…). Null = fallback hardcoded.';

-- Seed dalle foto già in uso nel picker (nessuna regressione visiva).
UPDATE public.rooms
SET photo_url = CASE slug
  WHEN 'sala-1' THEN 'https://www.musicproeventi.it/img/sale.jpg'
  WHEN 'sala-2' THEN '/rooms/verde.jpg'
  WHEN 'sala-3' THEN 'https://www.musicproeventi.it/img/vintage.jpg'
  ELSE photo_url
END
WHERE slug IN ('sala-1', 'sala-2', 'sala-3')
  AND photo_url IS NULL;
