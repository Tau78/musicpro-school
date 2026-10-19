-- Collaboratore: la prenotazione nasce confermata (niente coda di approvazione).
-- Può pagare in contanti in sede (default), con carta o con crediti.

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('stripe', 'credits', 'nexi', 'cash')
  );

CREATE OR REPLACE FUNCTION public.confirm_collaborator_booking(
  p_booking_id uuid,
  p_payment_method text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member uuid;
  v_booking public.bookings%ROWTYPE;
  v_method text;
BEGIN
  v_member := public.current_member_id();
  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'error_message', 'Devi effettuare l''accesso.'
    );
  END IF;

  IF NOT public.has_member_role('collaboratore'::public.member_role) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Solo un collaboratore può confermare così la prenotazione.'
    );
  END IF;

  v_method := lower(btrim(COALESCE(p_payment_method, '')));
  IF v_method NOT IN ('cash', 'nexi', 'credits') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_ACTION',
      'error_message', 'Metodo di pagamento non valido.'
    );
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_FOUND',
      'error_message', 'Prenotazione non trovata.'
    );
  END IF;

  IF v_booking.member_id IS DISTINCT FROM v_member
     AND NOT public.is_admin_or_segreteria() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHORIZED',
      'error_message', 'Non puoi confermare questa prenotazione.'
    );
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_CANCELLED',
      'error_message', 'Prenotazione annullata.'
    );
  END IF;

  IF v_booking.status = 'confirmed'::public.booking_status
     AND v_booking.payment_status IN ('paid', 'not_required') THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', v_booking.id,
      'status', 'confirmed',
      'payment_method', COALESCE(v_booking.payment_method, v_method),
      'payment_status', v_booking.payment_status,
      'requires_payment', false
    );
  END IF;

  IF v_booking.status NOT IN (
    'pending'::public.booking_status,
    'pending_approval'::public.booking_status,
    'confirmed'::public.booking_status
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_STATUS',
      'error_message', 'Stato prenotazione non valido.'
    );
  END IF;

  IF v_method = 'cash' THEN
    UPDATE public.bookings
    SET
      status = 'confirmed'::public.booking_status,
      payment_method = 'cash',
      payment_status = 'unpaid',
      updated_at = now()
    WHERE id = v_booking.id;
  ELSIF v_method = 'nexi' THEN
    UPDATE public.bookings
    SET
      status = 'confirmed'::public.booking_status,
      payment_method = 'nexi',
      payment_status = CASE
        WHEN payment_status IN ('paid', 'not_required', 'refunded') THEN payment_status
        ELSE 'unpaid'
      END,
      updated_at = now()
    WHERE id = v_booking.id;
  ELSE
    UPDATE public.bookings
    SET
      status = 'confirmed'::public.booking_status,
      payment_method = COALESCE(payment_method, 'credits'),
      updated_at = now()
    WHERE id = v_booking.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'status', 'confirmed',
    'payment_method', v_method,
    'requires_payment', (v_method = 'nexi')
  );
END;
$$;

COMMENT ON FUNCTION public.confirm_collaborator_booking(uuid, text) IS
  'Collaboratore: conferma subito la prenotazione. cash = contanti in sede, nexi = carta, credits = dopo addebito crediti.';

REVOKE ALL ON FUNCTION public.confirm_collaborator_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_collaborator_booking(uuid, text) TO authenticated;
