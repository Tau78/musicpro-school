-- MusicPro School — SELECT RLS for students/tutors: rooms + own lesson_attendances
-- Complements 065_student_lessons_read (enrollments/courses/lessons/subjects/titulars).
-- Read-only. No write policies.

-- ---------------------------------------------------------------------------
-- rooms — enrolled (own or ward) may SELECT active rooms (names for calendar)
-- Existing rooms_select_bookers still requires can_book_rooms(); this covers
-- associati without room-booking quota who need lesson room labels.
-- ---------------------------------------------------------------------------
CREATE POLICY "rooms_select_enrolled"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.course_enrollments e
      WHERE e.left_at IS NULL
        AND (
          e.member_id = public.current_member_id()
          OR public.is_tutor_of(e.member_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- lesson_attendances — own / ward row SELECT (hasAttendance on calendar)
-- ---------------------------------------------------------------------------
CREATE POLICY "lesson_attendances_select_own"
  ON public.lesson_attendances FOR SELECT
  TO authenticated
  USING (
    member_id = public.current_member_id()
    OR public.is_tutor_of(member_id)
  );
