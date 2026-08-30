-- MusicPro School — course_permission_overrides (V2 minimale)
-- Flag per corso × docente. Campi NULL = eredita da teacher_profiles.

CREATE TABLE public.course_permission_overrides (
  course_id            UUID NOT NULL REFERENCES public.courses (id) ON DELETE CASCADE,
  member_id            UUID NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  can_reschedule       BOOLEAN NULL,
  can_close_courses    BOOLEAN NULL,
  payment_visibility   TEXT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT course_permission_overrides_pkey
    PRIMARY KEY (course_id, member_id),
  CONSTRAINT course_permission_overrides_payment_visibility_check
    CHECK (
      payment_visibility IS NULL
      OR payment_visibility IN ('status', 'amounts', 'hidden')
    )
);

COMMENT ON TABLE public.course_permission_overrides IS
  'Override permessi didattici per corso × docente. Campi NULL ereditano da teacher_profiles.';
COMMENT ON COLUMN public.course_permission_overrides.can_reschedule IS
  'NULL = eredita teacher_profiles.can_reschedule.';
COMMENT ON COLUMN public.course_permission_overrides.can_close_courses IS
  'NULL = eredita teacher_profiles.can_close_courses.';
COMMENT ON COLUMN public.course_permission_overrides.payment_visibility IS
  'NULL = eredita teacher_profiles.payment_visibility. Valori: status | amounts | hidden.';

CREATE TRIGGER trg_course_permission_overrides_updated_at
  BEFORE UPDATE ON public.course_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.course_permission_overrides ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_permission_overrides
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_permission_overrides
  TO service_role;

-- Staff: full manage
CREATE POLICY "course_permission_overrides_manage_staff"
  ON public.course_permission_overrides FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- Docente: SELECT solo le proprie righe (per risolvere i propri flag sul corso)
CREATE POLICY "course_permission_overrides_select_own"
  ON public.course_permission_overrides FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );
