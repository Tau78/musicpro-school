-- MusicPro School — SELECT RLS for students (associato) and tutors on lessons calendar
-- Read-only: enrollments own/ward, active courses enrolled, scheduled lessons, subject catalog,
-- titular member names for enrolled courses. No write. No lesson_attendances.

-- ---------------------------------------------------------------------------
-- Helper — SECURITY DEFINER per evitare ricorsione RLS courses ↔ enrollments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_enrolled_in_course(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_enrollments e
    WHERE e.course_id = p_course_id
      AND e.left_at IS NULL
      AND (
        e.member_id = public.current_member_id()
        OR public.is_tutor_of(e.member_id)
      )
  );
$$;

COMMENT ON FUNCTION public.is_enrolled_in_course(UUID) IS
  'True se current_member_id() ha enrollment attivo sul corso, o è tutor di un iscritto attivo. SECURITY DEFINER (no RLS recursion).';

GRANT EXECUTE ON FUNCTION public.is_enrolled_in_course(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- course_enrollments — own / ward SELECT
-- ---------------------------------------------------------------------------
CREATE POLICY "course_enrollments_select_own"
  ON public.course_enrollments FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    OR public.is_tutor_of(member_id)
  );

-- ---------------------------------------------------------------------------
-- courses — enrolled + attivo only (no in_attesa holds for students)
-- ---------------------------------------------------------------------------
CREATE POLICY "courses_select_enrolled"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    public.is_enrolled_in_course(id)
    AND status = 'attivo'
  );

-- ---------------------------------------------------------------------------
-- lessons — enrolled, non cancelled
-- ---------------------------------------------------------------------------
CREATE POLICY "lessons_select_enrolled"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (
    public.is_enrolled_in_course(course_id)
    AND cancelled_at IS NULL
  );

-- ---------------------------------------------------------------------------
-- lesson_subjects — active catalog (not sensitive)
-- ---------------------------------------------------------------------------
CREATE POLICY "lesson_subjects_select_enrolled"
  ON public.lesson_subjects FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- members — titular of a course the viewer is enrolled in (own or ward)
-- ---------------------------------------------------------------------------
CREATE POLICY "members_select_enrolled_course_titular"
  ON public.members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.courses c
      WHERE c.titular_member_id = members.id
        AND public.is_enrolled_in_course(c.id)
        AND c.status = 'attivo'
    )
  );
