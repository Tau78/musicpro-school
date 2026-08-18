-- MusicPro School — RLS for courses / lessons (Fetta 5)
-- Staff (admin OR segreteria): ALL su courses, enrollments, course_teachers, lessons
-- Docente: SELECT corsi propri (titolare o riga in course_teachers);
--          INSERT corso (titolare + created_by = sé);
--          UPDATE solo propri in_attesa (titolare);
--          SELECT/INSERT enrollments e SELECT/INSERT/UPDATE lessons sui propri corsi
-- course_teachers: staff ALL; docente SELECT solo le proprie righe (coordinatore nascosto al titolare)
-- bookings: policy esistenti invariate (insert lezione via create_lesson_booking DEFINER)
-- Associato / tutore / social: no access

-- ---------------------------------------------------------------------------
-- Helper — SECURITY DEFINER per evitare ricorsione RLS courses ↔ course_teachers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_course_titular(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = p_course_id
      AND c.titular_member_id = public.current_member_id()
  );
$$;

COMMENT ON FUNCTION public.is_course_titular(UUID) IS
  'True se current_member_id() è titolare del corso. SECURITY DEFINER (no RLS recursion).';

CREATE OR REPLACE FUNCTION public.is_course_teacher(p_course_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_course_titular(p_course_id)
      OR EXISTS (
        SELECT 1
        FROM public.course_teachers ct
        WHERE ct.course_id = p_course_id
          AND ct.member_id = public.current_member_id()
      );
$$;

COMMENT ON FUNCTION public.is_course_teacher(UUID) IS
  'True se current_member_id() è titolare o ha una riga in course_teachers. SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Grants (RLS still restricts rows)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_teachers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lessons TO authenticated;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
CREATE POLICY "courses_select_docente"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_teacher(id)
  );

CREATE POLICY "courses_insert_docente"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND created_by = public.current_member_id()
    AND status = 'in_attesa'
  );

CREATE POLICY "courses_update_own_pending"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND status = 'in_attesa'
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND titular_member_id = public.current_member_id()
    AND status = 'in_attesa'
  );

CREATE POLICY "courses_manage_staff"
  ON public.courses FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- course_enrollments — docente: SELECT/INSERT sui propri corsi; staff ALL
-- ---------------------------------------------------------------------------
CREATE POLICY "course_enrollments_select_docente"
  ON public.course_enrollments FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_teacher(course_id)
  );

CREATE POLICY "course_enrollments_insert_docente"
  ON public.course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

CREATE POLICY "course_enrollments_manage_staff"
  ON public.course_enrollments FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- course_teachers — staff ALL; docente vede solo le proprie righe
-- (il titolare non deve vedere il coordinatore)
-- ---------------------------------------------------------------------------
CREATE POLICY "course_teachers_select_docente"
  ON public.course_teachers FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND member_id = public.current_member_id()
  );

CREATE POLICY "course_teachers_manage_staff"
  ON public.course_teachers FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- lessons — docente: SELECT (titolare o course_teachers), INSERT/UPDATE titolare
-- ---------------------------------------------------------------------------
CREATE POLICY "lessons_select_docente"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_teacher(course_id)
  );

CREATE POLICY "lessons_insert_docente"
  ON public.lessons FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

CREATE POLICY "lessons_update_docente"
  ON public.lessons FOR UPDATE
  TO authenticated
  USING (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  )
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND public.is_course_titular(course_id)
  );

CREATE POLICY "lessons_manage_staff"
  ON public.lessons FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
