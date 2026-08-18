-- Richieste spostamento lezione (docente senza flag). Coda UI: fetta successiva.

CREATE TABLE public.lesson_change_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id            UUID NOT NULL REFERENCES public.lessons (id) ON DELETE CASCADE,
  course_id            UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  requested_starts_at  TIMESTAMPTZ NOT NULL,
  requested_room_id    UUID REFERENCES public.rooms (id) ON DELETE SET NULL,
  scope                TEXT NOT NULL DEFAULT 'this',
  note                 TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  hold_booking_id      UUID REFERENCES public.bookings (id) ON DELETE SET NULL,
  created_by           UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_change_requests_scope_check
    CHECK (scope IN ('this', 'future')),
  CONSTRAINT lesson_change_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX idx_lesson_change_requests_status
  ON public.lesson_change_requests (status, created_at);

CREATE TRIGGER trg_lesson_change_requests_updated_at
  BEFORE UPDATE ON public.lesson_change_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lesson_change_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_change_requests TO authenticated;

CREATE POLICY "lesson_change_requests_staff"
  ON public.lesson_change_requests FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "lesson_change_requests_own"
  ON public.lesson_change_requests FOR ALL
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND created_by = public.current_member_id()
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND created_by = public.current_member_id()
  );
