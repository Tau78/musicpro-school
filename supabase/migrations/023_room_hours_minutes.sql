-- Room opening hours as minutes, so close can be 23:59 or after midnight.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS open_minute integer,
  ADD COLUMN IF NOT EXISTS close_minute integer;

UPDATE public.rooms
SET
  open_minute = COALESCE(open_minute, open_hour * 60),
  close_minute = COALESCE(close_minute, close_hour * 60)
WHERE open_minute IS NULL OR close_minute IS NULL;

ALTER TABLE public.rooms
  ALTER COLUMN open_minute SET DEFAULT 9 * 60,
  ALTER COLUMN close_minute SET DEFAULT 22 * 60,
  ALTER COLUMN open_minute SET NOT NULL,
  ALTER COLUMN close_minute SET NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'rooms'
      AND con.contype = 'c'
      AND (
        pg_get_constraintdef(con.oid) ILIKE '%open_hour%'
        OR pg_get_constraintdef(con.oid) ILIKE '%close_hour%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.rooms DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.rooms
  DROP CONSTRAINT IF EXISTS rooms_open_minute_range,
  DROP CONSTRAINT IF EXISTS rooms_close_minute_range,
  DROP CONSTRAINT IF EXISTS rooms_minutes_order;

ALTER TABLE public.rooms
  ADD CONSTRAINT rooms_open_minute_range
    CHECK (open_minute >= 0 AND open_minute < 1440),
  ADD CONSTRAINT rooms_close_minute_range
    CHECK (close_minute > 0 AND close_minute <= 2160),
  ADD CONSTRAINT rooms_minutes_order
    CHECK (close_minute > open_minute);

COMMENT ON COLUMN public.rooms.open_minute IS
  'Opening time as minutes from midnight (0–1439).';
COMMENT ON COLUMN public.rooms.close_minute IS
  'Closing time as minutes from midnight. Values > 1440 are the next day (e.g. 1500 = 01:00). 1440 = midnight.';
