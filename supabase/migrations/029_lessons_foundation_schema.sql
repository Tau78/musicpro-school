-- MusicPro School — Fetta 1: lessons foundation schema (materie, impostazioni, listino, retribuzione, profilo docente)
-- Timezone convention: Europe/Rome (application layer; timestamptz stored in UTC)
-- No RLS here — 030. No courses / lessons / attendance tables (later slices).

-- ---------------------------------------------------------------------------
-- lesson_subjects — catalogo materie (seed V1)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lesson_subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_subjects_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT lesson_subjects_slug_not_blank CHECK (char_length(trim(slug)) > 0)
);

CREATE UNIQUE INDEX idx_lesson_subjects_name_lower
  ON public.lesson_subjects (lower(name));

CREATE INDEX idx_lesson_subjects_active_sort
  ON public.lesson_subjects (is_active, sort_order, name)
  WHERE is_active = true;

COMMENT ON TABLE public.lesson_subjects IS
  'Catalogo materie didattiche — Chitarra, Basso, …; staff può aggiungere/disattivare.';
COMMENT ON COLUMN public.lesson_subjects.slug IS
  'URL/stable key (chitarra, basso, …).';

CREATE TRIGGER trg_lesson_subjects_updated_at
  BEFORE UPDATE ON public.lesson_subjects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.lesson_subjects (name, slug, sort_order, is_active)
VALUES
  ('Chitarra', 'chitarra', 10, true),
  ('Basso', 'basso', 20, true),
  ('Batteria', 'batteria', 30, true),
  ('Pianoforte', 'pianoforte', 40, true),
  ('Canto', 'canto', 50, true),
  ('Propedeutica Musicale', 'propedeutica-musicale', 60, true),
  ('Musicoterapia', 'musicoterapia', 70, true),
  ('Musica di Insieme', 'musica-di-insieme', 80, true);

-- ---------------------------------------------------------------------------
-- school_lesson_settings — singleton (anno corsi, griglia, soglie)
-- ---------------------------------------------------------------------------
CREATE TABLE public.school_lesson_settings (
  id                         BOOLEAN PRIMARY KEY DEFAULT true,
  grid_open_minute           INTEGER NOT NULL DEFAULT 600,
  grid_close_minute          INTEGER NOT NULL DEFAULT 1380,
  sunday_visible             BOOLEAN NOT NULL DEFAULT false,
  slot_granularity_minutes   INTEGER NOT NULL DEFAULT 15,
  default_group_capacity     INTEGER NOT NULL DEFAULT 8,
  attendance_edit_days       INTEGER NOT NULL DEFAULT 14,
  hold_hours                 INTEGER NOT NULL DEFAULT 48,
  reminder_week_hours        INTEGER NOT NULL DEFAULT 168,
  reminder_day_hours         INTEGER NOT NULL DEFAULT 24,
  reminder_soon_hours        INTEGER NOT NULL DEFAULT 2,
  pack_remind_hours_1        INTEGER NOT NULL DEFAULT 168,
  pack_remind_hours_2        INTEGER NOT NULL DEFAULT 24,
  notula_job_day             INTEGER NOT NULL DEFAULT 8,
  notula_job_hour            INTEGER NOT NULL DEFAULT 8,
  notula_sign_deadline_days  INTEGER NOT NULL DEFAULT 10,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT school_lesson_settings_singleton CHECK (id),
  CONSTRAINT school_lesson_settings_slot_granularity
    CHECK (slot_granularity_minutes IN (5, 15, 30)),
  CONSTRAINT school_lesson_settings_group_capacity
    CHECK (default_group_capacity > 0),
  CONSTRAINT school_lesson_settings_notula_job_day
    CHECK (notula_job_day BETWEEN 1 AND 28),
  CONSTRAINT school_lesson_settings_notula_job_hour
    CHECK (notula_job_hour BETWEEN 0 AND 23)
);

COMMENT ON TABLE public.school_lesson_settings IS
  'Impostazioni operative didattica — una sola riga (id = true). Date anno corsi in school_course_terms.';
COMMENT ON COLUMN public.school_lesson_settings.grid_open_minute IS
  'Apertura griglia calendario in minuti da mezzanotte (default 600 = 10:00). Europe/Rome in app.';
COMMENT ON COLUMN public.school_lesson_settings.grid_close_minute IS
  'Chiusura griglia in minuti da mezzanotte (default 1380 = 23:00). Europe/Rome in app.';
COMMENT ON COLUMN public.school_lesson_settings.sunday_visible IS
  'Se false, domenica nascosta in calendario (default).';
COMMENT ON COLUMN public.school_lesson_settings.slot_granularity_minutes IS
  'Passo inizio lezione: 5, 15 o 30 minuti (default 15).';
COMMENT ON COLUMN public.school_lesson_settings.default_group_capacity IS
  'Capienza default corsi collettivi se non indicata sul corso.';
COMMENT ON COLUMN public.school_lesson_settings.attendance_edit_days IS
  'Giorni in cui il docente può editare presenze passate (se mese notula non chiuso).';
COMMENT ON COLUMN public.school_lesson_settings.hold_hours IS
  'Ore di calendario di hold sala su corso in_attesa (default 48).';
COMMENT ON COLUMN public.school_lesson_settings.reminder_week_hours IS
  'Ore prima della lezione per reminder email famiglia (soglia lunga; default 168 = 7g).';
COMMENT ON COLUMN public.school_lesson_settings.reminder_day_hours IS
  'Reminder lezione/prova: ore prima (default 24).';
COMMENT ON COLUMN public.school_lesson_settings.reminder_soon_hours IS
  'Reminder lezione/prova: ore prima (default 2).';
COMMENT ON COLUMN public.school_lesson_settings.pack_remind_hours_1 IS
  'Sollecito pacchetto: ore prima della 5ª lezione (default 168).';
COMMENT ON COLUMN public.school_lesson_settings.pack_remind_hours_2 IS
  'Sollecito pacchetto: ore prima della 5ª lezione (default 24).';
COMMENT ON COLUMN public.school_lesson_settings.notula_job_day IS
  'Giorno del mese (1–28) in cui il job genera bozze notula. Interpretato in Europe/Rome.';
COMMENT ON COLUMN public.school_lesson_settings.notula_job_hour IS
  'Ora (0–23) del job notule. Interpretata in Europe/Rome (default 8 = 08:00).';
COMMENT ON COLUMN public.school_lesson_settings.notula_sign_deadline_days IS
  'Giorni per firmare la notula didattica; presenze non compilate slittano al mese dopo.';

CREATE TRIGGER trg_school_lesson_settings_updated_at
  BEFORE UPDATE ON public.school_lesson_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.school_lesson_settings (id) VALUES (true);

-- ---------------------------------------------------------------------------
-- school_course_terms — un anno corsi per riga; una sola «corrente»
-- ---------------------------------------------------------------------------
CREATE TABLE public.school_course_terms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  starts_on    DATE NOT NULL,
  ends_on      DATE NOT NULL,
  is_current   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT school_course_terms_label_not_blank CHECK (char_length(trim(label)) > 0),
  CONSTRAINT school_course_terms_range CHECK (ends_on >= starts_on)
);

CREATE UNIQUE INDEX idx_school_course_terms_one_current
  ON public.school_course_terms (is_current)
  WHERE is_current = true;

CREATE INDEX idx_school_course_terms_range
  ON public.school_course_terms (starts_on, ends_on);

COMMENT ON TABLE public.school_course_terms IS
  'Anni corsi (es. 2026/27). Senza riga corrente non si crea/approva un corso. Quote = anno solare.';
COMMENT ON COLUMN public.school_course_terms.is_current IS
  'Al più una riga true — UNIQUE parziale.';

CREATE TRIGGER trg_school_course_terms_updated_at
  BEFORE UPDATE ON public.school_course_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- school_closures — festività / chiusure scuola
-- ---------------------------------------------------------------------------
CREATE TABLE public.school_closures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_on       DATE NOT NULL,
  ends_on         DATE NOT NULL,
  title           TEXT NOT NULL,
  repeats_yearly  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT school_closures_range CHECK (ends_on >= starts_on),
  CONSTRAINT school_closures_title_not_blank CHECK (char_length(trim(title)) > 0)
);

COMMENT ON TABLE public.school_closures IS
  'Chiusure / festività scuola — in generazione lezioni si saltano e si accodano.';
COMMENT ON COLUMN public.school_closures.repeats_yearly IS
  'Se true, vale ogni anno (mese/giorno); starts_on/ends_on sono il template.';

CREATE INDEX idx_school_closures_range
  ON public.school_closures (starts_on, ends_on);

CREATE INDEX idx_school_closures_repeats
  ON public.school_closures (repeats_yearly);

CREATE TRIGGER trg_school_closures_updated_at
  BEFORE UPDATE ON public.school_closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Nazionali fisse, ricorrenti; Pasqua esclusa (data mobile).
INSERT INTO public.school_closures (starts_on, ends_on, title, repeats_yearly)
VALUES
  ('2000-01-01', '2000-01-01', 'Capodanno', true),
  ('2000-01-06', '2000-01-06', 'Epifania', true),
  ('2000-04-25', '2000-04-25', 'Liberazione', true),
  ('2000-05-01', '2000-05-01', 'Festa del lavoro', true),
  ('2000-06-02', '2000-06-02', 'Festa della Repubblica', true),
  ('2000-08-15', '2000-08-15', 'Ferragosto', true),
  ('2000-11-01', '2000-11-01', 'Ognissanti', true),
  ('2000-12-08', '2000-12-08', 'Immacolata', true),
  ('2000-12-25', '2000-12-25', 'Natale', true),
  ('2000-12-26', '2000-12-26', 'Santo Stefano', true);

-- ---------------------------------------------------------------------------
-- course_pack_prices — listino famiglia: pacchetto da 4 × tipo × durata
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_pack_prices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_kind       TEXT NOT NULL,
  duration_minutes  INTEGER NOT NULL,
  amount_eur        NUMERIC(10, 2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT course_pack_prices_kind_check
    CHECK (course_kind IN ('individuale', 'gruppo', 'online')),
  CONSTRAINT course_pack_prices_duration_check
    CHECK (duration_minutes IN (30, 45, 60, 90)),
  CONSTRAINT course_pack_prices_amount_check
    CHECK (amount_eur IS NULL OR amount_eur >= 0),
  CONSTRAINT course_pack_prices_kind_duration_unique
    UNIQUE (course_kind, duration_minutes)
);

COMMENT ON TABLE public.course_pack_prices IS
  'Listino famiglia — prezzo pacchetto da 4 lezioni per tipo e durata. Nessun euro hard-coded.';
COMMENT ON COLUMN public.course_pack_prices.amount_eur IS
  'NULL = non configurato: blocca l''approvazione corso. 0 € consentito (niente pacchetti/solleciti).';

CREATE INDEX idx_course_pack_prices_kind
  ON public.course_pack_prices (course_kind);

CREATE TRIGGER trg_course_pack_prices_updated_at
  BEFORE UPDATE ON public.course_pack_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.course_pack_prices (course_kind, duration_minutes, amount_eur)
SELECT kind, duration, NULL
FROM (VALUES ('individuale'), ('gruppo'), ('online')) AS kinds (kind)
CROSS JOIN (VALUES (30), (45), (60), (90)) AS durs (duration);

-- ---------------------------------------------------------------------------
-- pay_rate_types — catalogo voci retribuzione docente
-- ---------------------------------------------------------------------------
CREATE TABLE public.pay_rate_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  unit        TEXT NOT NULL,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pay_rate_types_slug_not_blank CHECK (char_length(trim(slug)) > 0),
  CONSTRAINT pay_rate_types_label_not_blank CHECK (char_length(trim(label)) > 0),
  CONSTRAINT pay_rate_types_unit_check
    CHECK (unit IN ('hourly', 'per_head_per_lesson'))
);

COMMENT ON TABLE public.pay_rate_types IS
  'Voci retribuzione estendibili — sul corso si sceglie dal dropdown. Base: Lezioni, Collettivo, Coordinamento.';
COMMENT ON COLUMN public.pay_rate_types.unit IS
  'hourly = €/h (individuale, coordinamento); per_head_per_lesson = tariffa-allievo × presenti (collettivo).';
COMMENT ON COLUMN public.pay_rate_types.is_system IS
  'true = voce seed di sistema (non eliminare).';

CREATE INDEX idx_pay_rate_types_active_sort
  ON public.pay_rate_types (is_active, sort_order, label)
  WHERE is_active = true;

CREATE TRIGGER trg_pay_rate_types_updated_at
  BEFORE UPDATE ON public.pay_rate_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.pay_rate_types (slug, label, unit, is_system, is_active, sort_order)
VALUES
  ('lezioni', 'Lezioni', 'hourly', true, true, 10),
  ('collettivo', 'Corso collettivo', 'per_head_per_lesson', true, true, 20),
  ('coordinamento', 'Coordinamento', 'hourly', true, true, 30);

-- ---------------------------------------------------------------------------
-- teacher_profiles — flag globali e visibilità pagamenti (1-1 members)
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_profiles (
  member_id            UUID PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  can_create_courses   BOOLEAN NOT NULL DEFAULT false,
  can_reschedule       BOOLEAN NOT NULL DEFAULT false,
  can_close_courses    BOOLEAN NOT NULL DEFAULT false,
  payment_visibility   TEXT NOT NULL DEFAULT 'hidden',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_profiles_payment_visibility_check
    CHECK (payment_visibility IN ('status', 'amounts', 'hidden'))
);

COMMENT ON TABLE public.teacher_profiles IS
  'Profilo didattico docente — flag globali (override sul corso in fette successive). Default tutti no.';
COMMENT ON COLUMN public.teacher_profiles.can_create_courses IS
  'Crea corsi (e prove): docente → coda approvazione; prova senza approvazione.';
COMMENT ON COLUMN public.teacher_profiles.can_reschedule IS
  'Annulla / sposta lezioni. Se false: richiesta + hold sul nuovo slot.';
COMMENT ON COLUMN public.teacher_profiles.can_close_courses IS
  'Chiudi corso. Se false: «Richiedi chiusura».';
COMMENT ON COLUMN public.teacher_profiles.payment_visibility IS
  'Visibilità pagamenti allievo: status | amounts | hidden.';

CREATE TRIGGER trg_teacher_profiles_updated_at
  BEFORE UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_pay_rates — importo per docente × voce
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_pay_rates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  pay_rate_type_id  UUID NOT NULL REFERENCES public.pay_rate_types (id) ON DELETE RESTRICT,
  amount_eur        NUMERIC(10, 2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_pay_rates_amount_check CHECK (amount_eur >= 0),
  CONSTRAINT teacher_pay_rates_member_type_unique UNIQUE (member_id, pay_rate_type_id)
);

COMMENT ON TABLE public.teacher_pay_rates IS
  'Tariffe docente per voce di catalogo. Cambio → dal mese notula successivo (app).';

CREATE INDEX idx_teacher_pay_rates_member
  ON public.teacher_pay_rates (member_id);

CREATE INDEX idx_teacher_pay_rates_type
  ON public.teacher_pay_rates (pay_rate_type_id);

CREATE TRIGGER trg_teacher_pay_rates_updated_at
  BEFORE UPDATE ON public.teacher_pay_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_subjects — materie insegnate (N:N)
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_subjects (
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES public.lesson_subjects (id) ON DELETE RESTRICT,
  PRIMARY KEY (member_id, subject_id)
);

COMMENT ON TABLE public.teacher_subjects IS
  'Materie insegnate dal docente — da catalogo lesson_subjects.';

CREATE INDEX idx_teacher_subjects_subject
  ON public.teacher_subjects (subject_id);

-- ---------------------------------------------------------------------------
-- teacher_availability — fasce settimanali; vuoto = tutto libero
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute   INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_availability_dow_iso
    CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT teacher_availability_minutes_order
    CHECK (end_minute > start_minute),
  CONSTRAINT teacher_availability_slot_unique
    UNIQUE (member_id, day_of_week, start_minute, end_minute)
);

COMMENT ON TABLE public.teacher_availability IS
  'Fasce in cui il docente è disponibile. Nessuna riga = tutto libero. Non si seedano blocchi.';
COMMENT ON COLUMN public.teacher_availability.day_of_week IS
  'ISO-8601: 1 = Monday … 7 = Sunday (lunedì-primo, non JS Date#getDay).';
COMMENT ON COLUMN public.teacher_availability.start_minute IS
  'Inizio fascia in minuti da mezzanotte (Europe/Rome in app).';
COMMENT ON COLUMN public.teacher_availability.end_minute IS
  'Fine fascia in minuti da mezzanotte; deve essere > start_minute.';

CREATE INDEX idx_teacher_availability_member_day
  ON public.teacher_availability (member_id, day_of_week);

CREATE TRIGGER trg_teacher_availability_updated_at
  BEFORE UPDATE ON public.teacher_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teacher_time_off — ferie / assenze (eccezioni)
-- ---------------------------------------------------------------------------
CREATE TABLE public.teacher_time_off (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_time_off_range CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.teacher_time_off IS
  'Ferie / assenze docente — le lezioni in questi intervalli si accodano.';
COMMENT ON COLUMN public.teacher_time_off.starts_at IS
  'Inizio assenza (timestamptz UTC; Europe/Rome in app).';
COMMENT ON COLUMN public.teacher_time_off.ends_at IS
  'Fine assenza (timestamptz UTC; Europe/Rome in app).';

CREATE INDEX idx_teacher_time_off_member_range
  ON public.teacher_time_off (member_id, starts_at, ends_at);

CREATE TRIGGER trg_teacher_time_off_updated_at
  BEFORE UPDATE ON public.teacher_time_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- members — bozza iscrizione (prova) + ritiro tessera/gadget
-- ---------------------------------------------------------------------------
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS is_enrollment_draft BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS draft_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS membership_card_picked_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gadgets_picked_up_at TIMESTAMPTZ;

COMMENT ON COLUMN public.members.is_enrollment_draft IS
  'Bozza rubrica da prova gratuita — senza numero associato; badge «Bozza».';
COMMENT ON COLUMN public.members.draft_expires_at IS
  'Scadenza bozza (default 30 giorni in app).';
COMMENT ON COLUMN public.members.membership_card_picked_up_at IS
  'Tessera ritirata (flag rubrica dopo ricevuta pacchetto).';
COMMENT ON COLUMN public.members.gadgets_picked_up_at IS
  'Gadget ritirati (flag rubrica dopo ricevuta pacchetto).';

CREATE INDEX IF NOT EXISTS idx_members_enrollment_draft
  ON public.members (is_enrollment_draft)
  WHERE is_enrollment_draft = true;

CREATE INDEX IF NOT EXISTS idx_members_draft_expires
  ON public.members (draft_expires_at)
  WHERE draft_expires_at IS NOT NULL;
