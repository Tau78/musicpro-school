-- Audit 4 UI: titolare può inserire sé in course_teachers (crea corso/prova);
-- reminder log accetta kind=week.

CREATE POLICY "course_teachers_insert_titolare"
  ON public.course_teachers FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_member_role('docente'::public.member_role)
    AND member_id = public.current_member_id()
    AND role = 'titolare'
    AND public.is_course_titular(course_id)
  );

ALTER TABLE public.lesson_reminder_log
  DROP CONSTRAINT lesson_reminder_log_kind_check;

ALTER TABLE public.lesson_reminder_log
  ADD CONSTRAINT lesson_reminder_log_kind_check
  CHECK (kind IN ('week', 'day', 'soon'));
