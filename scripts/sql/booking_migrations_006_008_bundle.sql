-- =============================================================================
-- MusicPro School — booking migrations bundle (006 + 007 + 008)
-- Project: mlsiagbrejjylqvcnfbe (MusicProSchool)
-- Run in Supabase Dashboard → SQL Editor (single paste or section-by-section).
-- After success, record versions in supabase_migrations.schema_migrations if needed.
-- Generated for manual deploy when `supabase db push` cannot reach pooler.
-- =============================================================================


-- =============================================================================
-- MIGRATION 006: 006_booking_config.sql
-- =============================================================================

-- MusicPro School — room booking config, pricing, lead-time thresholds

-- ---------------------------------------------------------------------------
-- booking_status: pending admin approval (6–12h lead time)
-- ---------------------------------------------------------------------------
ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- ---------------------------------------------------------------------------
-- rooms — pricing and slot config (admin-editable; defaults SuperSaaS-like)
-- ---------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS hourly_rate_eur numeric(10, 2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS slot_granularity_minutes integer NOT NULL DEFAULT 30
    CHECK (slot_granularity_minutes > 0 AND slot_granularity_minutes <= 120),
  ADD COLUMN IF NOT EXISTS default_duration_minutes integer NOT NULL DEFAULT 120
    CHECK (default_duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS min_duration_minutes integer NOT NULL DEFAULT 60
    CHECK (min_duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS max_duration_minutes integer NOT NULL DEFAULT 240
    CHECK (max_duration_minutes >= min_duration_minutes),
  ADD COLUMN IF NOT EXISTS open_hour integer NOT NULL DEFAULT 9
    CHECK (open_hour >= 0 AND open_hour <= 23),
  ADD COLUMN IF NOT EXISTS close_hour integer NOT NULL DEFAULT 22
    CHECK (close_hour >= 1 AND close_hour <= 24 AND close_hour > open_hour);

COMMENT ON COLUMN public.rooms.hourly_rate_eur IS 'Base hourly rate in euros';
COMMENT ON COLUMN public.rooms.slot_granularity_minutes IS 'Slot start increment in minutes (e.g. 30)';
COMMENT ON COLUMN public.rooms.default_duration_minutes IS 'Default booking duration in minutes (e.g. 120 = 2h)';

-- ---------------------------------------------------------------------------
-- bookings — stored price at booking time
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS total_price_eur numeric(10, 2),
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- ---------------------------------------------------------------------------
-- app_settings — lead-time and cancellation thresholds
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, description)
VALUES
  (
    'booking_auto_confirm_min_hours',
    '12',
    'Hours before start: auto-confirm band (>= this value)'
  ),
  (
    'booking_approval_min_hours',
    '6',
    'Hours before start: minimum to allow booking with admin approval'
  ),
  (
    'booking_cancel_min_hours',
    '24',
    'Hours before start: minimum for associate self-service cancellation'
  )
ON CONFLICT (key) DO NOTHING;

-- Seed room names/rates (placeholder slugs sala-1..4)
UPDATE public.rooms SET
  name = 'Rossa',
  description = 'Sala prova — tariffa base',
  hourly_rate_eur = 10.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-1';

UPDATE public.rooms SET
  name = 'Verde',
  description = 'Sala prova secondaria',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-2';

UPDATE public.rooms SET
  name = 'Arancio',
  description = 'Sala prova',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-3';

UPDATE public.rooms SET
  name = 'Sala 4',
  hourly_rate_eur = 15.00,
  slot_granularity_minutes = 30,
  default_duration_minutes = 120,
  min_duration_minutes = 60,
  max_duration_minutes = 240,
  open_hour = 9,
  close_hour = 22
WHERE slug = 'sala-4';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_booking_setting_int(p_key text, p_default integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (s.value)::integer FROM public.app_settings s WHERE s.key = p_key),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION public.booking_lead_time_hours(p_start_at timestamptz)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT EXTRACT(EPOCH FROM (p_start_at - now())) / 3600.0;
$$;

CREATE OR REPLACE FUNCTION public.booking_price_eur(
  p_hourly_rate numeric,
  p_duration_minutes integer
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ROUND((p_hourly_rate * (p_duration_minutes::numeric / 60.0))::numeric, 2);
$$;

-- ---------------------------------------------------------------------------
-- create_booking_safe — overlap check, pricing, lead-time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking_id UUID;
  v_status public.booking_status;
  v_room public.rooms%ROWTYPE;
  v_duration_minutes integer;
  v_price numeric(10, 2);
  v_lead_hours numeric;
  v_auto_hours integer;
  v_approval_hours integer;
  v_is_associato_only boolean;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per prenotare.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM v_current_member
     AND NOT public.has_member_role('admin'::public.member_role) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_MISMATCH',
      'error_message', 'Puoi prenotare solo per il tuo account.'
    );
  END IF;

  IF public.has_member_role('admin'::public.member_role)
     OR public.has_member_role('docente'::public.member_role) THEN
    NULL;
  ELSIF public.has_member_role('associato'::public.member_role) THEN
    IF NOT public.member_quota_ok(p_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_NOT_PAID',
        'error_message', 'Devi aver pagato la quota associativa per prenotare le sale.'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per prenotare le sale prova.'
    );
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  SELECT * INTO v_room
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  v_duration_minutes := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer;

  IF v_duration_minutes < v_room.min_duration_minutes
     OR v_duration_minutes > v_room.max_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', format(
        'Durata non valida per questa sala (%s–%s minuti).',
        v_room.min_duration_minutes,
        v_room.max_duration_minutes
      )
    );
  END IF;

  v_auto_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);
  v_approval_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
  v_lead_hours := public.booking_lead_time_hours(p_start_at);

  v_is_associato_only :=
    public.has_member_role('associato'::public.member_role)
    AND NOT public.has_member_role('admin'::public.member_role)
    AND NOT public.has_member_role('docente'::public.member_role);

  IF v_is_associato_only AND v_lead_hours < v_approval_hours THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOO_LATE',
      'error_message', format(
        'Non è possibile prenotare a meno di %s ore dall''inizio.',
        v_approval_hours
      )
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
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_price := public.booking_price_eur(v_room.hourly_rate_eur, v_duration_minutes);

  IF v_is_associato_only THEN
    IF v_lead_hours >= v_auto_hours THEN
      v_status := 'pending'::public.booking_status;
    ELSE
      v_status := 'pending_approval'::public.booking_status;
    END IF;
  ELSE
    v_status := 'confirmed'::public.booking_status;
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      v_status,
      v_price,
      v_duration_minutes
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT,
      'total_price_eur', v_price,
      'duration_minutes', v_duration_minutes,
      'requires_approval', (v_status = 'pending_approval'::public.booking_status)
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;
END;
$$;

COMMENT ON FUNCTION public.create_booking_safe IS
  'Creates booking with overlap check, pricing, lead-time. Status: pending (>=12h, pay later), pending_approval (6–12h), confirmed (admin/docente).';

-- ---------------------------------------------------------------------------
-- cancel_booking_safe — associate cancellation with lead-time
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_safe(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_cancel_hours integer;
  v_lead_hours numeric;
  v_is_admin boolean;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione già annullata.'
    );
  END IF;

  v_is_admin := public.has_member_role('admin'::public.member_role);

  IF v_booking.member_id IS DISTINCT FROM v_current_member AND NOT v_is_admin THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi annullare questa prenotazione.'
    );
  END IF;

  IF NOT v_is_admin THEN
    v_cancel_hours := public.get_booking_setting_int('booking_cancel_min_hours', 24);
    v_lead_hours := public.booking_lead_time_hours(v_booking.start_at);

    IF v_lead_hours < v_cancel_hours THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'CANCEL_TOO_LATE',
        'error_message', format(
          'Annullamento non consentito a meno di %s ore dall''inizio. Contatta la segreteria.',
          v_cancel_hours
        )
      );
    END IF;
  END IF;

  UPDATE public.bookings
  SET
    status = 'cancelled'::public.booking_status,
    cancelled_at = now(),
    cancelled_by = v_current_member
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_booking_safe(UUID) TO authenticated;

-- Allow pending_approval in insert policy
DROP POLICY IF EXISTS "bookings_insert_eligible" ON public.bookings;
CREATE POLICY "bookings_insert_eligible"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_book_rooms()
    AND member_id = public.current_member_id()
    AND status IN (
      'pending'::public.booking_status,
      'pending_approval'::public.booking_status,
      'confirmed'::public.booking_status
    )
  );

-- Associates may cancel own non-cancelled bookings (RPC enforces lead-time)
DROP POLICY IF EXISTS "bookings_cancel_own" ON public.bookings;
CREATE POLICY "bookings_cancel_own"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND status <> 'cancelled'::public.booking_status
  )
  WITH CHECK (
    member_id = public.current_member_id()
    AND status = 'cancelled'::public.booking_status
  );


-- =============================================================================
-- MIGRATION 007: 007_booking_admin_review.sql
-- =============================================================================

-- MusicPro School — admin approve/reject pending_approval bookings

CREATE OR REPLACE FUNCTION public.review_booking_safe(
  p_booking_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_action TEXT;
  v_new_status public.booking_status;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per gestire le prenotazioni.'
    );
  END IF;

  v_action := lower(trim(p_action));

  IF v_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ACTION',
      'error_message', 'Azione non valida. Usa approve o reject.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.status <> 'pending_approval'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', 'Solo le prenotazioni in attesa di approvazione possono essere gestite da qui.'
    );
  END IF;

  IF v_action = 'approve' THEN
    v_new_status := 'confirmed'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  ELSE
    v_new_status := 'cancelled'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      cancelled_at = now(),
      cancelled_by = v_current_member,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action
  );
END;
$$;

COMMENT ON FUNCTION public.review_booking_safe IS
  'Admin/segreteria: approve (confirmed) or reject (cancelled) a pending_approval booking.';

GRANT EXECUTE ON FUNCTION public.review_booking_safe(UUID, TEXT, TEXT)
  TO authenticated;

-- Segreteria may update bookings (was admin-only)
DROP POLICY IF EXISTS "bookings_update_admin" ON public.bookings;
CREATE POLICY "bookings_update_admin"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());


-- =============================================================================
-- MIGRATION 008: 008_stripe_room_booking.sql
-- =============================================================================

-- MusicPro School — Stripe payment for room bookings (pattern musicpro-eventi-app)

-- ---------------------------------------------------------------------------
-- bookings — payment tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_status_check
  CHECK (
    payment_status IN ('unpaid', 'link_sent', 'paid', 'not_required')
  );

COMMENT ON COLUMN public.bookings.payment_status IS
  'unpaid | link_sent | paid | not_required (admin/docente senza pagamento)';

CREATE INDEX IF NOT EXISTS idx_bookings_payment_pending
  ON public.bookings (member_id, start_at)
  WHERE status = 'pending'::public.booking_status
    AND payment_status IN ('unpaid', 'link_sent');

-- ---------------------------------------------------------------------------
-- Idempotency (webhook Stripe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stripe_room_booking_payment_receipts (
  payment_intent_id TEXT PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  stripe_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_room_booking_payment_receipts IS
  'Idempotenza webhook Stripe sale prova. Solo service_role.';

ALTER TABLE public.stripe_room_booking_payment_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.stripe_room_booking_payment_receipts FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.stripe_room_booking_payment_receipts TO service_role;

CREATE INDEX IF NOT EXISTS stripe_room_booking_payment_receipts_booking_id_idx
  ON public.stripe_room_booking_payment_receipts (booking_id);

-- ---------------------------------------------------------------------------
-- apply_stripe_room_booking_payment — webhook RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stripe_room_booking_payment(
  p_booking_ref TEXT,
  p_stripe_event_id TEXT DEFAULT NULL,
  p_stripe_event_type TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_payment_link_id TEXT DEFAULT NULL,
  p_amount_cents INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT := nullif(trim(coalesce(p_booking_ref, '')), '');
  v_booking public.bookings%ROWTYPE;
  v_rows INTEGER;
BEGIN
  IF v_ref IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Riferimento prenotazione mancante (mp_id_prenotazione).'
    );
  END IF;

  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    IF EXISTS (
      SELECT 1
      FROM public.stripe_room_booking_payment_receipts r
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
    ) THEN
      SELECT b.* INTO v_booking
      FROM public.stripe_room_booking_payment_receipts r
      JOIN public.bookings b ON b.id = r.booking_id
      WHERE r.payment_intent_id = trim(p_payment_intent_id)
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'booking_id', v_booking.id,
        'message', 'Pagamento gia elaborato (idempotenza Stripe).'
      );
    END IF;
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id::text = v_ref
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione non trovata.',
      'booking_ref', v_ref
    );
  END IF;

  IF v_booking.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'booking_id', v_booking.id,
      'message', 'Pagamento gia registrato.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Prenotazione annullata — pagamento non applicabile.',
      'booking_id', v_booking.id
    );
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'pending_approval'::public.booking_status
  ) AND v_booking.payment_status <> 'unpaid' AND v_booking.payment_status <> 'link_sent' THEN
    NULL;
  END IF;

  UPDATE public.bookings
  SET
    payment_status = 'paid',
    status = 'confirmed'::public.booking_status,
    stripe_payment_intent_id = nullif(trim(coalesce(p_payment_intent_id, '')), ''),
    payment_link_id = coalesce(
      nullif(trim(coalesce(p_payment_link_id, '')), ''),
      payment_link_id
    ),
    paid_at = now()
  WHERE id = v_booking.id
    AND payment_status <> 'paid';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF p_payment_intent_id IS NOT NULL AND trim(p_payment_intent_id) <> '' THEN
    INSERT INTO public.stripe_room_booking_payment_receipts (
      payment_intent_id,
      booking_id,
      stripe_event_id
    )
    VALUES (trim(p_payment_intent_id), v_booking.id, p_stripe_event_id)
    ON CONFLICT (payment_intent_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'rows_updated', v_rows,
    'status', 'confirmed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_room_booking_payment(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_stripe_room_booking_payment(
  TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER
) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_room_booking_payment IS
  'Webhook Stripe: marca prenotazione sala pagata e confirmed. p_booking_ref = bookings.id (uuid).';

-- ---------------------------------------------------------------------------
-- create_booking_safe — init payment_status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_safe(
  p_room_id UUID,
  p_member_id UUID,
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking_id UUID;
  v_status public.booking_status;
  v_payment_status TEXT;
  v_room public.rooms%ROWTYPE;
  v_duration_minutes integer;
  v_price numeric(10, 2);
  v_lead_hours numeric;
  v_auto_hours integer;
  v_approval_hours integer;
  v_is_associato_only boolean;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso per prenotare.'
    );
  END IF;

  IF p_member_id IS DISTINCT FROM v_current_member
     AND NOT public.has_member_role('admin'::public.member_role) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'MEMBER_MISMATCH',
      'error_message', 'Puoi prenotare solo per il tuo account.'
    );
  END IF;

  IF public.has_member_role('admin'::public.member_role)
     OR public.has_member_role('docente'::public.member_role) THEN
    NULL;
  ELSIF public.has_member_role('associato'::public.member_role) THEN
    IF NOT public.member_quota_ok(p_member_id) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'QUOTA_NOT_PAID',
        'error_message', 'Devi aver pagato la quota associativa per prenotare le sale.'
      );
    END IF;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per prenotare le sale prova.'
    );
  END IF;

  IF p_end_at <= p_start_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TIME',
      'error_message', 'L''orario di fine deve essere successivo all''inizio.'
    );
  END IF;

  SELECT * INTO v_room
  FROM public.rooms r
  WHERE r.id = p_room_id
    AND r.is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ROOM_NOT_FOUND',
      'error_message', 'Sala non trovata o non disponibile.'
    );
  END IF;

  v_duration_minutes := (EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 60)::integer;

  IF v_duration_minutes < v_room.min_duration_minutes
     OR v_duration_minutes > v_room.max_duration_minutes THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_DURATION',
      'error_message', format(
        'Durata non valida per questa sala (%s–%s minuti).',
        v_room.min_duration_minutes,
        v_room.max_duration_minutes
      )
    );
  END IF;

  v_auto_hours := public.get_booking_setting_int('booking_auto_confirm_min_hours', 12);
  v_approval_hours := public.get_booking_setting_int('booking_approval_min_hours', 6);
  v_lead_hours := public.booking_lead_time_hours(p_start_at);

  v_is_associato_only :=
    public.has_member_role('associato'::public.member_role)
    AND NOT public.has_member_role('admin'::public.member_role)
    AND NOT public.has_member_role('docente'::public.member_role);

  IF v_is_associato_only AND v_lead_hours < v_approval_hours THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'TOO_LATE',
      'error_message', format(
        'Non è possibile prenotare a meno di %s ore dall''inizio.',
        v_approval_hours
      )
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
      'error_code', 'SLOT_TAKEN',
      'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
    );
  END IF;

  v_price := public.booking_price_eur(v_room.hourly_rate_eur, v_duration_minutes);

  IF v_is_associato_only THEN
    v_payment_status := 'unpaid';
    IF v_lead_hours >= v_auto_hours THEN
      v_status := 'pending'::public.booking_status;
    ELSE
      v_status := 'pending_approval'::public.booking_status;
    END IF;
  ELSE
    v_status := 'confirmed'::public.booking_status;
    v_payment_status := 'not_required';
  END IF;

  BEGIN
    INSERT INTO public.bookings (
      room_id,
      member_id,
      start_at,
      end_at,
      status,
      total_price_eur,
      duration_minutes,
      payment_status
    )
    VALUES (
      p_room_id,
      p_member_id,
      p_start_at,
      p_end_at,
      v_status,
      v_price,
      v_duration_minutes,
      v_payment_status
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking_id,
      'status', v_status::TEXT,
      'total_price_eur', v_price,
      'duration_minutes', v_duration_minutes,
      'requires_approval', (v_status = 'pending_approval'::public.booking_status),
      'requires_payment', (v_payment_status = 'unpaid')
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'SLOT_TAKEN',
        'error_message', 'Questo slot è già prenotato. Scegli un altro orario.'
      );
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- review_booking_safe — approve → pending (pagamento), not confirmed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_booking_safe(
  p_booking_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_member UUID;
  v_booking public.bookings%ROWTYPE;
  v_action TEXT;
  v_new_status public.booking_status;
BEGIN
  v_current_member := public.current_member_id();

  IF v_current_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non hai i permessi per gestire le prenotazioni.'
    );
  END IF;

  v_action := lower(trim(p_action));

  IF v_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ACTION',
      'error_message', 'Azione non valida. Usa approve o reject.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.status <> 'pending_approval'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', 'Solo le prenotazioni in attesa di approvazione possono essere gestite da qui.'
    );
  END IF;

  IF v_action = 'approve' THEN
    v_new_status := 'pending'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      payment_status = CASE
        WHEN payment_status = 'not_required' THEN payment_status
        ELSE 'unpaid'
      END,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  ELSE
    v_new_status := 'cancelled'::public.booking_status;

    UPDATE public.bookings
    SET
      status = v_new_status,
      cancelled_at = now(),
      cancelled_by = v_current_member,
      notes = CASE
        WHEN p_notes IS NOT NULL AND trim(p_notes) <> '' THEN trim(p_notes)
        ELSE notes
      END
    WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', v_new_status::TEXT,
    'action', v_action,
    'requires_payment', (v_action = 'approve' AND v_new_status = 'pending'::public.booking_status)
  );
END;
$$;

-- =============================================================================
-- END bundle
-- =============================================================================
