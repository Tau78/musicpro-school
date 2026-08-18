-- MusicPro School — RLS for lessons foundation (Fetta 1)
-- Staff (admin OR segreteria): full manage on catalogs and all teachers' rows
-- Docente: SELECT catalogs; SELECT own profile / rates / subjects;
--          SELECT/INSERT/UPDATE/DELETE own availability and time-off
-- Associato / tutore / social: no access
-- members extra columns (draft / tessera / gadget) reuse existing members policies

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_lesson_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_course_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_pack_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_rate_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_time_off ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Grants (RLS still restricts rows)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lesson_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_lesson_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_course_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.school_closures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.course_pack_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pay_rate_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_pay_rates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_availability TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_time_off TO authenticated;

-- ---------------------------------------------------------------------------
-- lesson_subjects — catalog
-- ---------------------------------------------------------------------------
CREATE POLICY "lesson_subjects_select_docente"
  ON public.lesson_subjects FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "lesson_subjects_manage_staff"
  ON public.lesson_subjects FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- school_lesson_settings — singleton
-- ---------------------------------------------------------------------------
CREATE POLICY "school_lesson_settings_select_docente"
  ON public.school_lesson_settings FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "school_lesson_settings_manage_staff"
  ON public.school_lesson_settings FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "school_course_terms_select_docente"
  ON public.school_course_terms FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "school_course_terms_manage_staff"
  ON public.school_course_terms FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- school_closures
-- ---------------------------------------------------------------------------
CREATE POLICY "school_closures_select_docente"
  ON public.school_closures FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "school_closures_manage_staff"
  ON public.school_closures FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- course_pack_prices
-- ---------------------------------------------------------------------------
CREATE POLICY "course_pack_prices_select_docente"
  ON public.course_pack_prices FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "course_pack_prices_manage_staff"
  ON public.course_pack_prices FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- pay_rate_types — staff manage; is_system rows cannot be deleted
-- ---------------------------------------------------------------------------
CREATE POLICY "pay_rate_types_select_docente"
  ON public.pay_rate_types FOR SELECT
  TO authenticated
  USING (public.has_member_role('docente'::public.member_role));

CREATE POLICY "pay_rate_types_select_staff"
  ON public.pay_rate_types FOR SELECT
  TO authenticated
  USING (public.is_admin_or_segreteria());

CREATE POLICY "pay_rate_types_insert_staff"
  ON public.pay_rate_types FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "pay_rate_types_update_staff"
  ON public.pay_rate_types FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

CREATE POLICY "pay_rate_types_delete_staff"
  ON public.pay_rate_types FOR DELETE
  TO authenticated
  USING (
    public.is_admin_or_segreteria()
    AND NOT is_system
  );

-- ---------------------------------------------------------------------------
-- teacher_profiles — docente read-only own row; staff writes flags
-- ---------------------------------------------------------------------------
CREATE POLICY "teacher_profiles_select_own"
  ON public.teacher_profiles FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );

CREATE POLICY "teacher_profiles_manage_staff"
  ON public.teacher_profiles FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- teacher_pay_rates — docente read-only own rates; staff writes
-- ---------------------------------------------------------------------------
CREATE POLICY "teacher_pay_rates_select_own"
  ON public.teacher_pay_rates FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );

CREATE POLICY "teacher_pay_rates_manage_staff"
  ON public.teacher_pay_rates FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- teacher_subjects — docente read-only own subjects; staff writes
-- ---------------------------------------------------------------------------
CREATE POLICY "teacher_subjects_select_own"
  ON public.teacher_subjects FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );

CREATE POLICY "teacher_subjects_manage_staff"
  ON public.teacher_subjects FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- teacher_availability — docente manages own rows; staff manages all
-- ---------------------------------------------------------------------------
CREATE POLICY "teacher_availability_manage_own"
  ON public.teacher_availability FOR ALL
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  )
  WITH CHECK (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );

CREATE POLICY "teacher_availability_manage_staff"
  ON public.teacher_availability FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

-- ---------------------------------------------------------------------------
-- teacher_time_off — docente manages own rows; staff manages all
-- ---------------------------------------------------------------------------
CREATE POLICY "teacher_time_off_manage_own"
  ON public.teacher_time_off FOR ALL
  TO authenticated
  USING (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  )
  WITH CHECK (
    member_id = public.current_member_id()
    AND public.has_member_role('docente'::public.member_role)
  );

CREATE POLICY "teacher_time_off_manage_staff"
  ON public.teacher_time_off FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());
