-- Tighten lesson_change_requests RLS: docenti INSERT+SELECT own only
-- (no UPDATE status / DELETE that orphans hold bookings).
-- BEFORE DELETE pending → cancel hold booking if hold_booking_id is set.

DROP POLICY IF EXISTS "lesson_change_requests_own" ON public.lesson_change_requests;
DROP POLICY IF EXISTS "lesson_change_requests_staff" ON public.lesson_change_requests;

CREATE POLICY "lesson_change_requests_staff"
  ON public.lesson_change_requests FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_change_requests_insert_own"
  ON public.lesson_change_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND created_by = public.current_member_id()
    AND status = 'pending'
  );

CREATE POLICY "lesson_change_requests_select_own"
  ON public.lesson_change_requests FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND created_by = public.current_member_id()
  );

-- Cancel hold booking when a pending request is deleted (staff DELETE or CASCADE).
CREATE OR REPLACE FUNCTION public.lesson_change_request_cancel_hold_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' AND OLD.hold_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'cancelled'::public.booking_status,
      cancelled_at = COALESCE(cancelled_at, now()),
      cancelled_by = public.current_member_id()
    WHERE id = OLD.hold_booking_id
      AND status IS DISTINCT FROM 'cancelled'::public.booking_status
      AND source = 'lesson';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.lesson_change_request_cancel_hold_before_delete() IS
  'BEFORE DELETE su lesson_change_requests pending: cancella il hold booking collegato.';

DROP TRIGGER IF EXISTS trg_lesson_change_request_cancel_hold
  ON public.lesson_change_requests;

CREATE TRIGGER trg_lesson_change_request_cancel_hold
  BEFORE DELETE ON public.lesson_change_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.lesson_change_request_cancel_hold_before_delete();
