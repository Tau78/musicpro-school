-- Fetta 13: pausa / chiudi / rimuovi iscritto / undo 24h / richiesta chiusura.
-- Il docente titolare deve poter aggiornare un corso attivo (non solo in_attesa)
-- e left_at sugli iscritti. Override per-corso (course_permission_overrides) = fuori V1.

-- ---------------------------------------------------------------------------
-- RLS: titolare aggiorna ciclo vita sui propri corsi
-- ---------------------------------------------------------------------------
CREATE POLICY "courses_update_own_lifecycle"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND status IN ('attivo', 'in_pausa', 'chiuso')
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND status IN ('attivo', 'in_pausa', 'chiuso')
  );

CREATE POLICY "course_enrollments_update_titular"
  ON public.course_enrollments FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

-- ---------------------------------------------------------------------------
-- Eventi ciclo vita (snapshot lezioni + finestra undo 24h)
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_lifecycle_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  enrollment_id   UUID REFERENCES public.course_enrollments (id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES public.members (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  undo_until      TIMESTAMPTZ,
  undone_at       TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,

  CONSTRAINT course_lifecycle_events_kind_check
    CHECK (kind IN (
      'pause',
      'resume',
      'close',
      'remove_enrollment',
      'close_request',
      'undo'
    ))
);

CREATE INDEX idx_course_lifecycle_events_course
  ON public.course_lifecycle_events (course_id, created_at DESC);

CREATE INDEX idx_course_lifecycle_events_pending_request
  ON public.course_lifecycle_events (kind, resolved_at)
  WHERE kind = 'close_request' AND resolved_at IS NULL;

CREATE INDEX idx_course_lifecycle_events_undo
  ON public.course_lifecycle_events (course_id, undo_until)
  WHERE undone_at IS NULL AND undo_until IS NOT NULL;

COMMENT ON TABLE public.course_lifecycle_events IS
  'Pausa/chiusura/rimozione/richiesta. payload = snapshot lezioni + riepilogo contabile. undo_until = 24h.';

ALTER TABLE public.course_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_lifecycle_events_select_docente"
  ON public.course_lifecycle_events FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_teacher(course_id)
  );

CREATE POLICY "course_lifecycle_events_insert_titular"
  ON public.course_lifecycle_events FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

CREATE POLICY "course_lifecycle_events_update_titular"
  ON public.course_lifecycle_events FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

CREATE POLICY "course_lifecycle_events_manage_staff"
  ON public.course_lifecycle_events FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
