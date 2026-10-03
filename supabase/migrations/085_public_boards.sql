-- Tabelloni pubblici per Smart TV: orario del giorno e occupazione aule.
-- Lettura pubblica solo via service role (niente nomi completi in chiaro al client anon).

CREATE TABLE public.public_display_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pin TEXT NOT NULL CHECK (pin ~ '^[A-Z0-9]{4,12}$'),
  site_label TEXT NOT NULL DEFAULT 'MusicPro' CHECK (char_length(site_label) BETWEEN 1 AND 40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.public_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('timetable', 'occupancy')),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  layout TEXT NOT NULL DEFAULT 'aeroporto'
    CHECK (layout IN ('aeroporto', 'giorno', 'notte', 'viola')),
  room_id UUID REFERENCES public.rooms (id) ON DELETE SET NULL,
  show_individuals BOOLEAN NOT NULL DEFAULT TRUE,
  row_count INTEGER NOT NULL DEFAULT 7 CHECK (row_count BETWEEN 3 AND 24),
  row_height_px INTEGER NOT NULL DEFAULT 70 CHECK (row_height_px BETWEEN 36 AND 160),
  hide_brand BOOLEAN NOT NULL DEFAULT FALSE,
  columns JSONB NOT NULL DEFAULT '[]'::JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX public_boards_sort_idx ON public.public_boards (sort_order, created_at);

CREATE OR REPLACE FUNCTION public.generate_board_pin()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$;

INSERT INTO public.public_display_settings (id, enabled, pin, site_label)
VALUES (TRUE, FALSE, public.generate_board_pin(), 'MusicPro');

INSERT INTO public.public_boards (
  kind,
  name,
  layout,
  show_individuals,
  row_count,
  row_height_px,
  columns,
  sort_order
)
VALUES (
  'timetable',
  'MusicPro',
  'aeroporto',
  TRUE,
  7,
  70,
  '[
    {"key":"start_date","boardLabel":"Inizio","listLabel":"Inizio (dd/mm)"},
    {"key":"start_time","boardLabel":"Inizio","listLabel":"Inizio (h:m)"},
    {"key":"duration","boardLabel":"Durata","listLabel":"Durata"},
    {"key":"course","boardLabel":"Corso","listLabel":"Corso"},
    {"key":"site","boardLabel":"Sede","listLabel":"Sede"},
    {"key":"room","boardLabel":"Aula","listLabel":"Aula"},
    {"key":"teacher","boardLabel":"Docente","listLabel":"Docente"},
    {"key":"subject","boardLabel":"Materia","listLabel":"Materia"}
  ]'::JSONB,
  0
);

ALTER TABLE public.public_display_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_boards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_display_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_boards FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.public_display_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_boards TO authenticated;

CREATE POLICY public_display_settings_staff_select
  ON public.public_display_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY public_display_settings_staff_update
  ON public.public_display_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY public_boards_staff_all
  ON public.public_boards
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

COMMENT ON TABLE public.public_boards IS
  'Tabelloni Smart TV: orario del giorno (timetable) o occupazione aule (occupancy).';
