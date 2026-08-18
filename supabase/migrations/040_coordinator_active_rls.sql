-- Fetta 12: accesso docente solo se riga course_teachers ancora attiva
-- (dopo cambio coordinatore con data di decorrenza non deve più vedere il corso).

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
          AND (
            ct.ends_on IS NULL
            OR ct.ends_on >= (timezone('Europe/Rome', now()))::date
          )
      );
$$;

COMMENT ON FUNCTION public.is_course_teacher(UUID) IS
  'True se current_member_id() è titolare o ha una riga course_teachers ancora attiva. SECURITY DEFINER.';
