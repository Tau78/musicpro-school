-- MusicPro School — Fetta 5: courses / enrollments / teachers / lessons + occupazione sala
-- Timezone convention: Europe/Rome (application layer; timestamptz stored in UTC)
-- No RLS here — 033. No seed anno corsi (lo mette lo staff). Niente attendance / prove / wallet.

-- Ordine FK circolare bookings ↔ lessons:
--   1. courses (hold_booking_id dopo)
--   2. course_enrollments, course_teachers
--   3. lessons senza booking_id
--   4. bookings.source
--   5. lessons.booking_id
--   6. courses.hold_booking_id
-- Un solo lato FK: lessons.booking_id → bookings (niente bookings.lesson_id).

-- ---------------------------------------------------------------------------
-- courses — corso regolare (uno slot settimanale); sala obbligatoria se non online
-- ---------------------------------------------------------------------------
CREATE TABLE public.courses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  course_kind          TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'in_attesa',
  subject_id           UUID NOT NULL REFERENCES public.lesson_subjects (id) ON DELETE RESTRICT,
  titular_member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  room_id              UUID REFERENCES public.rooms (id) ON DELETE RESTRICT,
  duration_minutes     INTEGER NOT NULL,
  weekly_dow           INTEGER NOT NULL,
  weekly_start_minute  INTEGER NOT NULL,
  starts_on            DATE NOT NULL,
  term_id              UUID NOT NULL REFERENCES public.school_course_terms (id) ON DELETE RESTRICT,
  max_students         INTEGER NOT NULL DEFAULT 1,
  price_eur            NUMERIC(10, 2) NOT NULL DEFAULT 0,
  pay_rate_type_id     UUID REFERENCES public.pay_rate_types (id) ON DELETE RESTRICT,
  pay_amount_eur       NUMERIC(10, 2),
  counts_as_hour       BOOLEAN NOT NULL DEFAULT false,
  hold_until           TIMESTAMPTZ,
  closed_on            DATE,
  rejected_at          TIMESTAMPTZ,
  created_by           UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT courses_name_not_blank CHECK (char_length(trim(name)) > 0),
  CONSTRAINT courses_kind_check
    CHECK (course_kind IN ('individuale', 'gruppo', 'online')),
  CONSTRAINT courses_status_check
    CHECK (status IN ('in_attesa', 'attivo', 'rifiutato', 'in_pausa', 'chiuso')),
  CONSTRAINT courses_duration_check
    CHECK (duration_minutes IN (30, 45, 60, 90)),
  CONSTRAINT courses_weekly_dow_iso
    CHECK (weekly_dow BETWEEN 1 AND 7),
  CONSTRAINT courses_weekly_start_minute
    CHECK (weekly_start_minute BETWEEN 0 AND 1439),
  CONSTRAINT courses_max_students_kind
    CHECK (
      (course_kind IN ('individuale', 'online') AND max_students = 1)
      OR (course_kind = 'gruppo' AND max_students >= 1)
    ),
  CONSTRAINT courses_price_check CHECK (price_eur >= 0),
  CONSTRAINT courses_pay_amount_check
    CHECK (pay_amount_eur IS NULL OR pay_amount_eur >= 0),
  CONSTRAINT courses_room_online_check
    CHECK (
      (course_kind = 'online' AND room_id IS NULL)
      OR (course_kind <> 'online' AND room_id IS NOT NULL)
    )
);

CREATE INDEX idx_courses_status
  ON public.courses (status);

CREATE INDEX idx_courses_titular
  ON public.courses (titular_member_id);

CREATE INDEX idx_courses_hold_until
  ON public.courses (hold_until)
  WHERE hold_until IS NOT NULL;

CREATE INDEX idx_courses_term
  ON public.courses (term_id);

CREATE INDEX idx_courses_subject
  ON public.courses (subject_id);

COMMENT ON TABLE public.courses IS
  'Corso didattico regolare — un solo slot settimanale. Online = niente sala; presenza = sala obbligatoria.';
COMMENT ON COLUMN public.courses.course_kind IS
  'individuale | gruppo | online.';
COMMENT ON COLUMN public.courses.status IS
  'in_attesa | attivo | rifiutato | in_pausa | chiuso. Default in_attesa (coda staff).';
COMMENT ON COLUMN public.courses.room_id IS
  'Sala default. NULL solo se online (CHECK). In app obbligatoria in presenza.';
COMMENT ON COLUMN public.courses.weekly_dow IS
  'ISO-8601: 1 = Monday … 7 = Sunday (lunedì-primo, non JS Date#getDay).';
COMMENT ON COLUMN public.courses.weekly_start_minute IS
  'Inizio slot settimanale in minuti da mezzanotte (Europe/Rome in app). 0–1439.';
COMMENT ON COLUMN public.courses.starts_on IS
  'Data inizio corso (anche retroattiva). Generazione lezioni da qui a fine term.';
COMMENT ON COLUMN public.courses.max_students IS
  '1 se individuale/online; default app 8 per gruppo (DEFAULT DB = 1).';
COMMENT ON COLUMN public.courses.price_eur IS
  'Prezzo famiglia sul corso (anche 0 €). Listino pack è course_pack_prices.';
COMMENT ON COLUMN public.courses.pay_rate_type_id IS
  'Voce retribuzione scelta sul corso (default dal titolare, staff può cambiare).';
COMMENT ON COLUMN public.courses.pay_amount_eur IS
  'Snapshot importo docente al momento della scelta voce.';
COMMENT ON COLUMN public.courses.counts_as_hour IS
  'Se true, le lezioni del corso contano come ora (regole app).';
COMMENT ON COLUMN public.courses.hold_until IS
  'Scadenza hold sala su corso in_attesa (default 48h da creazione, in app).';
COMMENT ON COLUMN public.courses.closed_on IS
  'Data chiusura (obbligatoria in app, anche retroattiva).';
COMMENT ON COLUMN public.courses.rejected_at IS
  'Timestamp rifiuto (scadenza hold o staff).';

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- course_enrollments — iscritti al corso (saldo iniziale prepaid; left_at = uscita)
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_enrollments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id                UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  member_id                UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  opening_prepaid_lessons  INTEGER NOT NULL DEFAULT 0,
  left_at                  TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT course_enrollments_course_member_unique UNIQUE (course_id, member_id),
  CONSTRAINT course_enrollments_opening_check CHECK (opening_prepaid_lessons >= 0)
);

CREATE INDEX idx_course_enrollments_member
  ON public.course_enrollments (member_id);

COMMENT ON TABLE public.course_enrollments IS
  'Iscrizione allievo a un corso. Unique (course_id, member_id).';
COMMENT ON COLUMN public.course_enrollments.opening_prepaid_lessons IS
  'Saldo iniziale lezioni già pagate (transizione SS / anno precedente).';
COMMENT ON COLUMN public.course_enrollments.left_at IS
  'Uscita dall''iscrizione (Rimuovi iscritto). NULL = ancora iscritto.';

CREATE TRIGGER trg_course_enrollments_updated_at
  BEFORE UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- course_teachers — titolare / coordinatore (coordinatore nascosto al titolare in app)
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_teachers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  role       TEXT NOT NULL,
  starts_on  DATE NOT NULL,
  ends_on    DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT course_teachers_role_check
    CHECK (role IN ('titolare', 'coordinatore')),
  CONSTRAINT course_teachers_range
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE UNIQUE INDEX idx_course_teachers_one_active_titolare
  ON public.course_teachers (course_id, role)
  WHERE role = 'titolare' AND ends_on IS NULL;

CREATE INDEX idx_course_teachers_course
  ON public.course_teachers (course_id);

CREATE INDEX idx_course_teachers_member
  ON public.course_teachers (member_id);

COMMENT ON TABLE public.course_teachers IS
  'Assegnazioni docente sul corso. Un solo titolare attivo (UNIQUE parziale). Coordinatore solo staff.';
COMMENT ON COLUMN public.course_teachers.role IS
  'titolare | coordinatore. Coordinatore invisibile al titolare (app / RLS).';
COMMENT ON COLUMN public.course_teachers.ends_on IS
  'NULL = assegnazione attiva. Cambio titolare/coordinatore = chiudi riga + nuova.';

CREATE TRIGGER trg_course_teachers_updated_at
  BEFORE UPDATE ON public.course_teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- lessons — occorrenze generate; # = sequence_number per corso (anche da_piazzare)
-- ---------------------------------------------------------------------------
CREATE TABLE public.lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  sequence_number  INTEGER NOT NULL,
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ,
  room_id          UUID REFERENCES public.rooms (id) ON DELETE RESTRICT,
  placement        TEXT NOT NULL DEFAULT 'scheduled',
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lessons_course_sequence_unique UNIQUE (course_id, sequence_number),
  CONSTRAINT lessons_sequence_check CHECK (sequence_number >= 0),
  CONSTRAINT lessons_placement_check
    CHECK (placement IN ('scheduled', 'da_piazzare')),
  CONSTRAINT lessons_scheduled_times
    CHECK (
      placement <> 'scheduled'
      OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
    ),
  CONSTRAINT lessons_time_order
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_lessons_course
  ON public.lessons (course_id);

CREATE INDEX idx_lessons_starts_at
  ON public.lessons (starts_at);

CREATE INDEX idx_lessons_placement
  ON public.lessons (placement);

COMMENT ON TABLE public.lessons IS
  'Lezione di un corso. # = sequence_number (ordine di generazione, anche da_piazzare).';
COMMENT ON COLUMN public.lessons.sequence_number IS
  'Progressivo per corso assegnato in generazione (da_piazzare incluso). 0 solo temporaneo poi ricompattato in app.';
COMMENT ON COLUMN public.lessons.starts_at IS
  'Inizio (timestamptz UTC). NULL se da_piazzare.';
COMMENT ON COLUMN public.lessons.ends_at IS
  'Fine (timestamptz UTC). NULL se da_piazzare.';
COMMENT ON COLUMN public.lessons.room_id IS
  'Sala di questa occorrenza (può differire dal default del corso). NULL se online o da piazzare.';
COMMENT ON COLUMN public.lessons.placement IS
  'scheduled = in calendario; da_piazzare = slot saltato in generazione (occupazione).';
COMMENT ON COLUMN public.lessons.cancelled_at IS
  'Annullata: libera sala, non accoda, non scala pacchetto (regole app).';

CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookings — source (occupazione lezione vs prenotazione associato)
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'booking';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_source_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_source_check
    CHECK (source IN ('booking', 'calendar', 'lesson'));

COMMENT ON COLUMN public.bookings.source IS
  'Origine occupazione sala: booking (associato), calendar (esterno), lesson (lezione didattica).';

-- ---------------------------------------------------------------------------
-- lessons.booking_id — unico lato FK (niente bookings.lesson_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES public.bookings (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_lessons_booking_id
  ON public.lessons (booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON COLUMN public.lessons.booking_id IS
  'Occupazione sala (bookings.source = lesson). ON DELETE SET NULL. 1:1 se valorizzato.';

-- ---------------------------------------------------------------------------
-- courses.hold_booking_id — hold 48h in_attesa (stesso calendario sale)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS hold_booking_id UUID REFERENCES public.bookings (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.courses.hold_booking_id IS
  'Prenotazione hold sala su corso in_attesa. ON DELETE SET NULL.';

-- ---------------------------------------------------------------------------
-- create_lesson_booking — occupa sala per lezione (no lead-time, band, quota, prezzo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lesson_booking(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ,
  p_title TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking_id UUID;
  v_duration_minutes integer;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT (
    public.is_admin_or_segreteria()
    OR public.has_member_role('docente'::public.member_role)
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per occupare una sala per una lezione.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'MEMBER_MISMATCH',
      'error_message', 'Puoi occupare la sala solo a tuo nome.'
    );
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = p_room_id
      AND r.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND b.status <> 'cancelled'::public.booking_status
      AND b.start_at < p_end_at
      AND b.end_at > p_start_at
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', NULL,
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_duration_minutes := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      title,
      total_price_eur,
      duration_minutes,
      payment_status,
      source
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      'confirmed'::public.booking_status,
      p_title,
      0,
      v_duration_minutes,
      'not_required',
      'lesson'
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'error_code', NULL,
      'error_message', NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'booking_id', NULL,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;
END;
$$;

COMMENT ON FUNCTION public.create_lesson_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) IS
  'Occupazione sala per lezione: confirmed, payment_status=not_required, source=lesson. Solo overlap (niente lead-time, band, quota, prezzo). Staff o docente.';

GRANT EXECUTE ON FUNCTION public.create_lesson_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- cancel_lesson_booking — annulla solo source=lesson; staff o proprietario
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_lesson_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.source IS DISTINCT FROM 'lesson' THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'error_code', 'NOT_A_LESSON',
      'error_message', 'Questa prenotazione non è una lezione.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione già annullata.'
    );
  END IF;

  IF v_booking.member_id IS DISTINCT FROM v_current_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'booking_id', p_booking_id,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi annullare questa lezione.'
    );
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'error_code', NULL,
    'error_message', NULL
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_lesson_booking(UUID) IS
  'Annulla una occupazione source=lesson (status=cancelled, cancelled_at=now()). Staff o proprietario. Niente penali crediti.';

GRANT EXECUTE ON FUNCTION public.cancel_lesson_booking(UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
