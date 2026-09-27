-- Tutore di default del docente (staff). Su ogni corso non-prova diventa coordinatore.
-- Il titolare non ha SELECT: non vede nome, quota né questa riga.

CREATE TABLE IF NOT EXISTS public.teacher_default_tutors (
  member_id          UUID PRIMARY KEY REFERENCES public.members (id) ON DELETE CASCADE,
  tutor_member_id    UUID NOT NULL REFERENCES public.members (id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT teacher_default_tutors_not_self
    CHECK (member_id <> tutor_member_id)
);

COMMENT ON TABLE public.teacher_default_tutors IS
  'Tutore didattico del docente, impostato dallo staff. Si copia come coordinatore su ogni corso non-prova. Il titolare non legge questa tabella.';

CREATE INDEX IF NOT EXISTS idx_teacher_default_tutors_tutor
  ON public.teacher_default_tutors (tutor_member_id);

DROP TRIGGER IF EXISTS trg_teacher_default_tutors_updated_at
  ON public.teacher_default_tutors;
CREATE TRIGGER trg_teacher_default_tutors_updated_at
  BEFORE UPDATE ON public.teacher_default_tutors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.teacher_default_tutors ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_default_tutors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_default_tutors TO service_role;

DROP POLICY IF EXISTS "teacher_default_tutors_manage_staff"
  ON public.teacher_default_tutors;
CREATE POLICY "teacher_default_tutors_manage_staff"
  ON public.teacher_default_tutors FOR ALL
  TO authenticated
  USING (public.is_admin_or_segreteria())
  WITH CHECK (public.is_admin_or_segreteria());

INSERT INTO public.teacher_default_tutors (member_id, tutor_member_id)
VALUES (
  '485c40d7-55be-44bd-b83f-38ab03d01864',
  'f1830cee-80f9-4c1c-a195-24c2fd19bf9e'
)
ON CONFLICT (member_id) DO UPDATE
SET tutor_member_id = EXCLUDED.tutor_member_id;

CREATE OR REPLACE FUNCTION public.assign_default_tutor_on_course(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titular uuid;
  v_starts date;
  v_trial boolean;
  v_tutor uuid;
  v_current_id uuid;
  v_current_member uuid;
  v_current_start date;
  v_new_start date;
BEGIN
  SELECT c.titular_member_id, c.starts_on, COALESCE(c.is_trial, false)
    INTO v_titular, v_starts, v_trial
  FROM public.courses c
  WHERE c.id = p_course_id;

  IF v_titular IS NULL OR v_trial THEN
    RETURN;
  END IF;

  IF NOT public.is_admin_or_segreteria()
     AND public.current_member_id() IS DISTINCT FROM v_titular THEN
    RETURN;
  END IF;

  SELECT t.tutor_member_id
    INTO v_tutor
  FROM public.teacher_default_tutors t
  WHERE t.member_id = v_titular;

  IF v_tutor IS NULL OR v_tutor = v_titular THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.member_roles r
    WHERE r.member_id = v_tutor
      AND r.role = 'docente'
      AND r.revoked_at IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT ct.id, ct.member_id, ct.starts_on
    INTO v_current_id, v_current_member, v_current_start
  FROM public.course_teachers ct
  WHERE ct.course_id = p_course_id
    AND ct.role = 'coordinatore'
    AND ct.ends_on IS NULL
  ORDER BY ct.starts_on DESC
  LIMIT 1;

  IF v_current_member = v_tutor THEN
    RETURN;
  END IF;

  v_new_start := COALESCE(v_starts, CURRENT_DATE);

  IF v_current_id IS NOT NULL THEN
    UPDATE public.course_teachers
    SET ends_on = GREATEST(v_current_start, v_new_start - 1)
    WHERE id = v_current_id;
  END IF;

  INSERT INTO public.course_teachers (course_id, member_id, role, starts_on)
  VALUES (p_course_id, v_tutor, 'coordinatore', v_new_start);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_teacher_default_tutor(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor uuid;
  v_course record;
BEGIN
  IF NOT public.is_admin_or_segreteria() THEN
    RAISE EXCEPTION 'Solo lo staff imposta il tutore.';
  END IF;

  SELECT t.tutor_member_id
    INTO v_tutor
  FROM public.teacher_default_tutors t
  WHERE t.member_id = p_member_id;

  FOR v_course IN
    SELECT c.id
    FROM public.courses c
    WHERE c.titular_member_id = p_member_id
      AND COALESCE(c.is_trial, false) = false
      AND c.status IN ('in_attesa', 'attivo', 'in_pausa')
  LOOP
    IF v_tutor IS NULL THEN
      UPDATE public.course_teachers ct
      SET ends_on = GREATEST(ct.starts_on, CURRENT_DATE)
      WHERE ct.course_id = v_course.id
        AND ct.role = 'coordinatore'
        AND ct.ends_on IS NULL;
    ELSE
      PERFORM public.assign_default_tutor_on_course(v_course.id);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_default_tutor_on_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_teacher_default_tutor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_default_tutor_on_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_teacher_default_tutor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_default_tutor_on_course(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_teacher_default_tutor(uuid) TO service_role;
